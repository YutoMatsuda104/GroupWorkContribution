/*******************************
 * 必要なモジュールの読み込み
 *******************************/
const express = require("express");
const app = express();
const https = require("https");
const fs = require("fs");
const path = require("path");
const socketIO = require("socket.io");

/*******************************
 * グローバルデータストレージ
 *******************************/

// ユーザーがどのルームに属しているか → userInfoMap: [socket.id] => [roomId, userName]
const userInfoMap = new Map();

// ルームごとのアバター情報（最後の位置情報などを記録）
const lastUserInfo = new Map();

let connectedUsers = 0;

/** 
 * ユーザーごとの動作ログを保持するマップ
 * userMotionMap.get(socket.id) -> [{ time, userName, posX, posY, posZ, rotX, rotY, rotZ, rotW? }, ...]
 */
const userMotionMap = new Map();

/*******************************
 * Express ミドルウェア設定
 *******************************/
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/*******************************
 * HTTPS サーバーの設定
 *******************************/
const options = {
  key: fs.readFileSync("ssl/key.pem"),   // 秘密鍵
  cert: fs.readFileSync("ssl/cert.pem"), // サーバ証明書
};

const server = https.createServer(options, app).listen(3001, () => {
  console.log("HTTPS listening on port 3001...");
});

/*******************************
 * Socket.IO サーバーの作成
 *******************************/
const io = socketIO(server);

/*******************************
 * Socket.IO メインイベントハンドラー
 *******************************/
io.on("connection", (socket) => {
  console.log(`New user connected: ${socket.id}`);

  // ユーザーが所属するルームID・ユーザー名を管理
  let roomId = "";
  let userName = "";

  /**
   * step1_join-room
   * ユーザーがルームに参加
   */
  socket.on("step1_join-room", (room, _userName) => {
    console.log(`User ${_userName} joined room ${room}`);

    connectedUsers++;
    console.log(`New connection. Total users: ${connectedUsers}`);

    // ルームに参加
    socket.join(room);
    roomId = room;
    userName = _userName;

    // userInfoMap に登録
    userInfoMap.set(socket.id, [roomId, userName]);

    // 他クライアントに参加通知
    socket.to(room).emit("user-connected", userName);

    // 既存のアバター情報があれば送信
    if (lastUserInfo.has(room)) {
      const roomInfo = lastUserInfo.get(room);
      roomInfo.forEach((infoData) => {
        // infoData: [socketId, userColor, userName, position, quaternion]
        socket.emit("step3_updateOtherAvatar", infoData);
      });
    }

    // ユーザーごとの動作ログを初期化（後で CSV 出力用）
    userMotionMap.set(socket.id, []);
  });

  /**
   * step2_sendMyAvatarUpdate
   * data: [ userColor, userName, position{ x, y, z }, quaternion{ x, y, z, w } ]
   */
  socket.on("step2_sendMyAvatarUpdate", (data) => {
    const [userColor, _userName, userPosition, userQuaternion] = data;
    // クライアントにブロードキャストする形式
    const newData = [
      socket.id,
      userColor,
      _userName,
      userPosition,
      userQuaternion,
    ];

    // lastUserInfo の更新
    if (!roomId) {
      console.warn(`No roomId available for socket: ${socket.id}`);
      return;
    }
    if (!lastUserInfo.has(roomId)) {
      lastUserInfo.set(roomId, new Map());
    }
    lastUserInfo.get(roomId).set(socket.id, newData);

    // ユーザーごとの動作ログに追加
    const currentTime = getLocalTimeWithMs();
    const motionLog = {
      time: currentTime,
      userName: _userName,
      posX: userPosition.x,
      posY: userPosition.y,
      posZ: userPosition.z,
      rotX: userQuaternion.x,
      rotY: userQuaternion.y,
      rotZ: userQuaternion.z,
      rotW: userQuaternion.w, // 必要ならログ化
    };

    if (userMotionMap.has(socket.id)) {
      userMotionMap.get(socket.id).push(motionLog);
    } else {
      userMotionMap.set(socket.id, [motionLog]);
    }

    // ルーム内の他クライアントに更新情報を送信
    socket.to(roomId).emit("step3_updateOtherAvatar", newData);
  });

  /**
   * disconnect
   * ユーザーがルームを抜ける時
   */
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    connectedUsers--;

    // lastUserInfo から削除
    if (roomId && lastUserInfo.has(roomId)) {
      const roomInfo = lastUserInfo.get(roomId);
      roomInfo.delete(socket.id);
      if (roomInfo.size === 0) {
        lastUserInfo.delete(roomId);
      }
    }

    // 他クライアントへアバター削除通知
    if (roomId) {
      socket.to(roomId).emit("removeAvatar", socket.id);
    }

    // CSV ディレクトリが無ければ作成
    const csvDir = path.join(__dirname, "CSV");
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }

    // ユーザーごとの動作ログをCSVに出力
    if (userMotionMap.has(socket.id)) {
      const logs = userMotionMap.get(socket.id);

      // ファイル名をわかりやすく：
      // 例）[日付]_[roomID]_[userName]_[socketID].csv
      // 日付形式: YYYYMMDD-HHMMSS
      const now = new Date();
      const dateStr = now.toISOString().replace(/[^0-9]/g, "").slice(0,14);
      // 2025-03-10T09:24:52.123Z → 20250310092452

      // roomID や userName に特殊文字が含まれる場合は置き換え推奨
      const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");

      // ファイル名例: csv/20250310092452_myTestRoom_AbCdEfG.csv
      const csvFilename = `${dateStr}_${safeRoomId}_${socket.id}.csv`;
      const filePath = path.join(csvDir, csvFilename);

      // ヘッダ行
      const header = "time,userName,posX,posY,posZ,rotX,rotY,rotZ,rotW\n";

      // 各行
      const lines = logs.map((log) => {
        return [
          log.time,
          log.userName,
          log.posX,
          log.posY,
          log.posZ,
          log.rotX,
          log.rotY,
          log.rotZ,
          log.rotW, // 不要なら外す
        ].join(",");
      });

      const csvContent = header + lines.join("\n") + "\n";

      fs.writeFile(filePath, csvContent, (err) => {
        if (err) {
          console.error("Error writing CSV file:", err);
        } else {
          console.log(`CSV file written: ${filePath}`);
        }
      });

      // メモリ上から削除
      userMotionMap.delete(socket.id);
    }
  });
});

function getLocalTimeWithMs() {
  const now = new Date();
  // タイムゾーンは日本時間に合わせるため、toLocaleString を使わず、
  // getFullYear() 等で自力でフォーマット
  const yy = now.getFullYear();
  // 月・日・時・分・秒・ミリ秒をゼロ埋め
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mn = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");

  return `${yy}/${mm}/${dd} ${hh}:${mn}:${ss}.${ms}`;
}
