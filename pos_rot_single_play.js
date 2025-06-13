/*******************************
 * 必要なモジュールの読み込み
 *******************************/
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const https = require("https");

/*******************************
 * HTTPSサーバーの設定
 *******************************/
const options = {
  key: fs.readFileSync("ssl/key.pem"), // 秘密鍵
  cert: fs.readFileSync("ssl/cert.pem"), // サーバ証明書
};

// Expressアプリを生成
const app = express();

// HTTPSサーバーを起動
https.createServer(options, app).listen(3001, () => {
  console.log("HTTPS listening on 3001...");
});

/*******************************
 * 静的ファイルのホスティング設定
 *******************************/
// publicディレクトリを静的ファイル提供用のルートとして設定
app.use(express.static(path.join(__dirname, "public")));

/*******************************
 * サーバサイドにCSV保存用ディレクトリを用意 (なければ作成)
 *******************************/
const csvDir = path.join(__dirname, "CSV");
if (!fs.existsSync(csvDir)) {
  fs.mkdirSync(csvDir); // ディレクトリが無い場合に作成
}

/*******************************
 * ファイルアップロード(Multer)の設定
 *******************************/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // CSVディレクトリを保存先に指定
    cb(null, csvDir);
  },
  filename: (req, file, cb) => {
    // クライアント側が送ってきたファイル名をそのまま使用
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });

/*******************************
 * CSVファイルアップロード用エンドポイント
 *******************************/
app.post("/upload_csv", upload.single("file"), (req, res) => {
  // 正常に受け取った場合のレスポンス
  res.status(200).json({ message: "File uploaded successfully" });
});

/*******************************
 * ホームページ(ルートパス"/")アクセス時の処理
 *******************************/
app.use((req, res, next) => {
  // ルートパス ("/") 以外なら次へ
  if (req.path !== "/") {
    return next();
  }

  // publicディレクトリの中のファイル一覧を取得
  const publicPath = path.join(__dirname, "public");
  fs.readdir(publicPath, (err, files) => {
    if (err) {
      return res.status(500).send("ディレクトリを読み込めませんでした");
    }

    // 拡張子が .html のものだけ抽出
    const htmlFiles = files.filter((file) => file.endsWith(".html"));

    // それらをリンクにして一覧表示
    const fileListHTML = htmlFiles
      .map((file) => `<a href="${path.join(req.path, file)}">${file}</a>`)
      .join("</br>");

    res.send(`<h1>Room：</h1>${fileListHTML}`);
  });
});
