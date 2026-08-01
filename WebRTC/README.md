# RC-WebRTC プロジェクト構成

このプロジェクトは、WebRTC・BLE・ラジコン制御を役割ごとに分割しています。

---

# フォルダ構成

```
WebRTC
├─ public
│  ├─ index.html
│  ├─ css
│  │   ├─ layout.css
│  │   ├─ buttons.css
│  │   ├─ settings.css
│  │   └─ mobile.css
│  │
│  └─ js
│      ├─ appState.js
│      ├─ ui.js
│      ├─ emergencyStop.js
│      ├─ ble.js
│      ├─ dataChannel.js
│      ├─ webrtc.js
│      ├─ drive.js
│      └─ main.js
│
├─ src
│   └─ index.js
│
└─ wrangler.jsonc
```

---

# 各ファイルの役割

## index.html

画面レイアウト。

ボタンや映像表示などHTMLだけを書く。

画面に表示する要素のみ。

---

## css/

画面デザイン。

### layout.css

画面全体のレイアウト。

### buttons.css

各種ボタン。

### settings.css

詳細設定画面。

### mobile.css

スマホ表示専用。

---

## js/appState.js

アプリ全体で使う状態を管理する。

例

- driveStopped
- peerConnection
- driveChannel
- localStream
- role
- BLE接続状態
- STOP状態

「状態変数」はここに置く。

---

## js/ui.js

画面表示だけ担当。

例

- ボタンの有効・無効
- ステータス表示
- STOPボタン表示変更
- 接続表示
- 詳細設定UI

通信処理を書かない。

---

## js/emergencyStop.js

非常停止専用。

ここだけが

driveStopped

を書き換える。

担当

- applyEmergencyStopState()
- clearEmergencyStopState()
- STOPボタン表示
- STOP命令送信

通信処理は書かない。

---

## js/ble.js

BLEだけ担当。

担当

- BLE接続
- BLE切断
- BLE送信
- BLE受信

WebRTCを書かない。

---

## js/dataChannel.js

DataChannel専用。

担当

- DataChannel生成
- DataChannel送信
- DataChannel受信
- emergency-stop送信
- emergency-stop-release送信
- joystick送信

WebRTC生成は書かない。

---

## js/webrtc.js

WebRTCだけ担当。

担当

- RTCPeerConnection
- ICE
- Offer
- Answer
- ontrack
- onconnectionstatechange
- onclose
- peer-left

DataChannelの中身は書かない。

---

## js/drive.js

ラジコン制御。

担当

- ジョイスティック
- STOPボタン
- sendStopCommand()
- sendDriveCommand()
- 走行速度

WebRTCを書かない。

---

## js/main.js

起動処理だけ。

担当

- addEventListener()
- 初期化
- 各モジュール呼び出し

ロジックは書かない。

---

## src/index.js

Cloudflare Worker。

担当

- WebSocket
- Durable Object
- Signaling
- Assets配信

画面処理を書かない。

---

## wrangler.jsonc

Cloudflare設定。

担当

- Worker設定
- publicフォルダ公開
- Durable Object設定

---

# 今後のルール

新しい機能を追加するときは、

「どの役割か」

を先に決める。

同じ処理を複数ファイルへ書かない。

---

# 非常停止

非常停止は

js/emergencyStop.js

だけが管理する。

他のファイルで

```
driveStopped = true
driveStopped = false
```

を書かない。

必ず

```
applyEmergencyStopState()

clearEmergencyStopState()
```

を呼ぶ。

---

# DataChannel

DataChannelへ直接送るコードは

js/dataChannel.js

だけに書く。

他ファイルは

```
sendEmergencyStop()

sendJoystick()

sendDriveCommand()
```

などの関数だけを呼ぶ。

---

# WebRTC切断

通信断は

js/webrtc.js

だけが判定する。

他のファイルは

```
handleCommunicationLost()
```

だけを呼ぶ。

---

# 目標

- driveStopped を一元管理
- STOP処理を一元管理
- DataChannel送信を一元管理
- BLE送信を一元管理
- WebRTC切断を一元管理
