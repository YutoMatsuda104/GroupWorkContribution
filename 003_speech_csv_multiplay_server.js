/*******************************
 * 003_speech_csv_multiplay_server.js
 *******************************/

// ========== 必要なモジュールの読み込み ==========
const express = require("express");
const app = express();
const https = require("https");
const fs = require("fs");
const path = require("path");
const socketIO = require("socket.io");

// ========== グローバルデータストレージ ==========
// ユーザーのルーム参加状態や最後のアバター情報（モーションログ）を記録
const userInfoMap = new Map();      // [socket.id] => [roomId, userName]
const lastUserInfo = new Map();     // lastUserInfo.get(roomId) => Map(socket.id => [socketId, color, userName, pos, quat])

// ユーザーごとのモーションログ (位置・回転)
const userMotionMap = new Map();    // userMotionMap.get(socket.id) => [{ time, userName, posX, posY, posZ, rotX, rotY, rotZ, rotW? }, ...]

// ユーザーごとの音声認識テキストログ
const userSpeechMap = new Map();    // userSpeechMap.get(socket.id) => [{ time, userName, speechText }, ...]

// 接続人数カウント
let connectedUsers = 0;

// ========== Express ミドルウェア設定 ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ========== HTTPSサーバーの設定 ==========
const options = {
  key: fs.readFileSync("ssl/key.pem"),  // 秘密鍵
  cert: fs.readFileSync("ssl/cert.pem") // サーバ証明書
};

const server = https.createServer(options, app);
server.listen(3001, () => {
  console.log("HTTPS listening on port 3001...");
});

// ========== Socket.IO サーバー作成 ==========
const io = socketIO(server);

// ========== メインイベントハンドラー ==========
io.on("connection", (socket) => {
  console.log(`New user connected: ${socket.id}`);

  let roomId = "";
  let userName = "";

  /*******************************
   * 1) step1_join-room
   *******************************/
  socket.on("step1_join-room", (_roomId, _userName) => {
    console.log(`User ${_userName} joined room ${_roomId}`);

    connectedUsers++;
    console.log(`New connection. Total users: ${connectedUsers}`);

    // ルーム参加
    socket.join(_roomId);
    roomId = _roomId;
    userName = _userName;

    // ユーザーマップ登録
    userInfoMap.set(socket.id, [roomId, userName]);

    // 他クライアントに参加通知
    socket.to(roomId).emit("user-connected", userName);

    // 既存アバター情報があれば送信
    if (lastUserInfo.has(roomId)) {
      const roomInfo = lastUserInfo.get(roomId);
      roomInfo.forEach((infoData) => {
        socket.emit("step3_updateOtherAvatar", infoData);
      });
    }

    // ユーザーごとのモーション/音声ログを初期化
    userMotionMap.set(socket.id, []);
    userSpeechMap.set(socket.id, []);
  });

  /*******************************
   * 2) step2_sendMyAvatarUpdate
   *******************************/
  socket.on("step2_sendMyAvatarUpdate", (data) => {
    // data: [ userColor, userName, position{ x,y,z }, quaternion{ x,y,z,w } ]
    const [userColor, _userName, userPosition, userQuaternion] = data;

    // クライアントに通知する形式
    const newData = [
      socket.id,
      userColor,
      _userName,
      userPosition,
      userQuaternion
    ];

    // lastUserInfo 更新
    if (roomId) {
      if (!lastUserInfo.has(roomId)) {
        lastUserInfo.set(roomId, new Map());
      }
      lastUserInfo.get(roomId).set(socket.id, newData);
    }

    // モーションログに追記
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
      rotW: userQuaternion.w,
    };
    if (userMotionMap.has(socket.id)) {
      userMotionMap.get(socket.id).push(motionLog);
    }

    // 他のクライアントへ通知
    socket.to(roomId).emit("step3_updateOtherAvatar", newData);
  });

  /*******************************
   * 音声テキスト受信イベント (example)
   *******************************/
  socket.on("speech_text", (textData) => {
    // textData の例: { speechText: "...", startTime: "...", endTime: "..." } など
    // ※ 構造はクライアント側で自由に設計
    console.log(`speech_text received from ${socket.id}:`, textData);

    if (!userSpeechMap.has(socket.id)) {
      userSpeechMap.set(socket.id, []);
    }

    const currentTime = getLocalTimeWithMs();
    userSpeechMap.get(socket.id).push({
      time: currentTime,        // ログ取り時刻
      userName: userName,       // このユーザーの名前
      speechText: textData.speechText || "",
      // 必要に応じて startTime, endTime, etc. を追記
    });
  });

  /*******************************
   * disconnect
   *******************************/
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    connectedUsers--;

    // ルーム内のアバター管理から削除
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

    // --- モーションログを書き出し ---
    if (userMotionMap.has(socket.id)) {
      const logs = userMotionMap.get(socket.id);
      if (logs.length > 0) {
        saveMotionLogCSV(roomId, socket.id, logs);
      }
      userMotionMap.delete(socket.id);
    }

    // --- 音声テキストログを書き出し ---
    if (userSpeechMap.has(socket.id)) {
      const speechLogs = userSpeechMap.get(socket.id);
      if (speechLogs.length > 0) {
        saveSpeechLogCSV(roomId, socket.id, speechLogs);
      }
      userSpeechMap.delete(socket.id);
    }
  });
});

/*******************************
 * モーションログをCSVに出力
 *******************************/
function saveMotionLogCSV(roomId, socketId, logs) {
  // CSVディレクトリ
  const csvDir = path.join(__dirname, "CSV");
  if (!fs.existsSync(csvDir)) {
    fs.mkdirSync(csvDir, { recursive: true });
  }
  // 日付文字列(YYYYMMDD-HHMMSS)などを作ってユニーク化
  const now = new Date();
  const dateStr = now.toISOString().replace(/[^0-9]/g, "").slice(0,14);
  // roomId から安全な文字列を作成
  const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");
  // ファイル名
  const csvFilename = `${dateStr}_${safeRoomId}_${socketId}_motion.csv`;
  const filePath = path.join(csvDir, csvFilename);

  // ヘッダ行
  const header = "time,socketId,userName,posX,posY,posZ,rotX,rotY,rotZ,rotW\n";
  const lines = logs.map(log => {
    return [
      log.time,
      socketId,
      log.userName,
      log.posX,
      log.posY,
      log.posZ,
      log.rotX,
      log.rotY,
      log.rotZ,
      log.rotW
    ].join(",");
  });
  const csvContent = header + lines.join("\n") + "\n";

  fs.writeFile(filePath, csvContent, (err) => {
    if (err) {
      console.error("Error writing motion CSV:", err);
    } else {
      console.log(`Motion CSV written: ${filePath}`);
    }
  });
}

/*******************************
 * スピーチログをCSVに出力
 *******************************/
function saveSpeechLogCSV(roomId, socketId, speechLogs) {
  // CSVディレクトリ
  const csvDir = path.join(__dirname, "CSV");
  if (!fs.existsSync(csvDir)) {
    fs.mkdirSync(csvDir, { recursive: true });
  }
  // ユニークな日付文字列を生成
  const now = new Date();
  const dateStr = now.toISOString().replace(/[^0-9]/g, "").slice(0,14);
  const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");

  // ファイル名: [dateStr]_[roomId]_[socketId]_speech.csv
  const csvFilename = `${dateStr}_${safeRoomId}_${socketId}_speech.csv`;
  const filePath = path.join(csvDir, csvFilename);

  // ヘッダ行
  const header = "time,socketId, userName,speechText\n";
  const lines = speechLogs.map(log => {
    return [
      log.time,
      socketId,
      log.userName,
      JSON.stringify(log.speechText) // カンマ含む場合もあるので安全に
    ].join(",");
  });
  const csvContent = header + lines.join("\n") + "\n";

  fs.writeFile(filePath, csvContent, (err) => {
    if (err) {
      console.error("Error writing speech CSV:", err);
    } else {
      console.log(`Speech CSV written: ${filePath}`);
    }
  });
}

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
