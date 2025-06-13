/*******************************
 * 必要なモジュールの読み込み
 *******************************/

// Express本体を読み込み（Webアプリケーション機能）
const express = require("express");

// ファイルアップロード機能を提供するMulterモジュール
const multer = require("multer");

// Expressアプリケーションを生成
const app = express();

// HTTPSサーバーを立てるために必要なモジュール
const https = require("https");

// ファイル操作に必要なモジュール
const fs = require("fs");

// パス操作を簡単にするモジュール
const path = require("path");

/*******************************
 * HTTPSサーバーの設定
 *******************************/

// SSLで使用する秘密鍵(key)と証明書(cert)を読み込み
const options = {
  key: fs.readFileSync("ssl/key.pem"), // 秘密鍵ファイル
  cert: fs.readFileSync("ssl/cert.pem"), // サーバ証明書ファイル
};

// HTTPSサーバーを起動
https.createServer(options, app).listen(3001, () => {
  console.log("HTTPS listening on 3001...");
});

/*******************************
 * 静的ファイルのホスティング設定
 *******************************/

// publicディレクトリを静的ファイルのルートディレクトリとして指定
// これにより、public配下のファイルは「/ファイル名」でアクセスできるようになる
app.use(express.static(path.join(__dirname, "public")));

/*******************************
 * ファイルアップロードの設定
 *******************************/

// diskStorageを使ってアップロードファイルを指定の場所に保存
const storage = multer.diskStorage({
  // destination: ファイルの保存先を指定
  destination: (req, file, cb) => {
    // 第1引数(null)はエラーを表す引数（今回はエラーなしのためnull）
    cb(null, "public/CSV/");
  },
  // filename: アップロード時のファイル名を指定
  filename: (req, file, cb) => {
    // file.originalnameで元のファイル名を取得
    cb(null, file.originalname);
  },
});

// 実際にMulterを使用するためのインスタンスを生成
// 上で指定したstorageを設定
const upload = multer({ storage: storage });

/*******************************
 * CSVファイルアップロード用エンドポイント
 *******************************/

// '/upload_csv'に対してPOSTリクエストがあった場合、
// 'file'という名前のフォームデータを1つ受け取って保存する
app.post("/upload_csv", upload.single("file"), (req, res) => {
  // アップロード成功時のレスポンスを返す
  res.status(200).send({ message: "File uploaded successfully" });
});

/*******************************
 * ホームページ（ルートパス「/」）アクセス時の処理
 * - publicディレクトリ内のHTMLファイルを一覧表示する
 *******************************/

// 任意のリクエストが来た時に実行されるミドルウェア
app.use((req, res, next) => {
  // もしルートパス("/")以外だった場合は、この関数をスキップして次へ進む
  if (req.path !== "/") {
    return next();
  }

  // publicディレクトリのパスを取得
  const publicPath = path.join(__dirname, "public");

  // publicディレクトリにあるファイルを読み込む
  fs.readdir(publicPath, (err, files) => {
    if (err) {
      // もし読み込み時にエラーがあればエラーハンドリング
      return res.status(500).send("ディレクトリを読み込めませんでした");
    }

    // フォルダ内のファイルのうち、「.html」で終わるファイルだけを抽出
    const htmlFiles = files.filter((file) => file.endsWith(".html"));

    // HTMLファイルの一覧をリンク形式で並べる
    const fileListHTML = htmlFiles
      .map((file) => `<a href="${path.join(req.path, file)}">${file}</a>`)
      .join("</br>");

    // ブラウザに一覧を表示
    res.send(`<h1>Room：</h1>${fileListHTML}`);
  });
});
