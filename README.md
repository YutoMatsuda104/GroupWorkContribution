# GroupWorkContribution
（2025/02/08更新）
ステップバイステップ（マルチプレイ時のデータ取得）
1. Lv1:マルチプレイ
    - 001_multiplay_server.js
    - 001_multiplay.html
    - js/001_multiplay_client.js
2. Lv2:マルチプレイ＋アバタのモーションデータ取得
    - 002_csv_multiplay_server.js
    - 001_multiplay.html（上記Lv1と同じ）
    - js/001_multiplay_client.js（上記Lv1と同じ）
3. Lv3：マルチプレイ＋アバタのモーションデータ取得
    - 003_speech_csv_multiplay_server.js
    - 003_speech_multiplay.html
    - js/003_speech_multiplay_client.js
4. Lv4：視線＋マルチプレイ＋アバタのモーションデータ取得
    - 004_gaze_speech_csv_multiplay_server.js
    - 004_gaze_calibration.html -> 004_gaze_speech_multiplay.html
    - js/004_gaze_speech_multiplay_client.js

（2025/01/19更新）
playerのposition,rotation取得・CSV保存（非マルチプレイ）
1. step1：基本
    1. サーバファイル：pos_rot_single_play.js
    2. クライアントファイル：pos_rot_single_play.html
2. step2：移動可能範囲の制御（簡易的なコライダー）の追加
    1. サーバファイル：pos_rot_single_play.js
    2. クライアントファイル：limit_movement.html
    3. js/limit_movement.js
3. step3：Webカメラによる視線データ取得機能の追加
    1. サーバファイル：pos_rot_gaze_single_play.js
    2. クライアントファイル
        1. gaze.html（キャリブレーションの後、下のファイルに遷移）
        2. pos_rot_gaze_single_play.html
    3. js/gaze.js

初期設定
1. git clone https://github.com/RNMUDS/GroupWorkContribution.git
2. cd GroupWorkContribution
3. code .
4. VSCodeのターミナルで　npm install

視線データ測定（single or multi）
https://localhost:3001/gaze.htmlにアクセス
キャリブレーション→視線測定
