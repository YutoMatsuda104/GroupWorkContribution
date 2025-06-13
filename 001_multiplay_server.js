/*******************************
 * 必要なモジュールの読み込み
 *******************************/
// Express本体を読み込み（Webアプリケーション機能）
const express = require("express");

// Expressアプリケーションを生成
const app = express();

// HTTPSサーバーを立てるために必要なモジュール
const https = require("https");

// ファイル操作に必要なモジュール
const fs = require("fs");

// パス操作を簡単にするモジュール
const path = require("path");

// Socket.IOを読み込み
const socketIO = require("socket.io");

// publicディレクトリを静的ファイルのルートディレクトリとして指定
app.use(express.static(path.join(__dirname, "public")));

/*******************************
 * HTTPSサーバーの設定
 *******************************/
const options = {
  key: fs.readFileSync("ssl/key.pem"), // 秘密鍵
  cert: fs.readFileSync("ssl/cert.pem"), // サーバ証明書
};

// HTTPSサーバーの作成と起動
const server = https.createServer(options, app);
server.listen(3001, () => {
  console.log("HTTPS listening on 3001...");
});

/*******************************
 * Socket.IO サーバーの作成
 *******************************/
const io = socketIO(server);

/*******************************
 * Socket.IO メインイベントハンドラー
 *******************************/
io.on("connection", (socket) => {

  // ルームID
  let roomId = "";

  // ルーム参加イベント
  socket.on("step1_join-room", (room, userName) => {
    // ルームに参加したことをコンソールに出力
    console.log(`User ${userName} joined room ${room}`);
    // ルームに参加
    socket.join(room);

    // ルームIDを保持
    roomId = room;
    // 自分以外のクライアントに参加通知を送信
    socket.to(room).emit("user-connected", userName);
    // ユーザー情報の登録
  });

  // ルーム離脱イベント
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });

  // sendMyAvatarUpdateイベント
  socket.on("step2_sendMyAvatarUpdate", (data) => {
      // データを展開
      const userColor = data[0];
      const userName = data[1];
      const userPosition = data[2];
      const userQuaternion = data[3];
  
      // クライアントが期待する形式 [socketId, userColor, userName, position, quaternion]
      const newData = [
        socket.id,      // ←追加
        userColor,
        userName,
        userPosition,
        userQuaternion
      ];
    // ルーム内の全クライアントに送信
    socket.to(roomId).emit("step3_updateOtherAvatar", newData);
  });
});
