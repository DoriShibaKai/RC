"use strict";

    const roomInput = document.getElementById("roomName");
    const sendButton = document.getElementById("sendButton");
    const viewButton = document.getElementById("viewButton");
    const driveStopButton = document.getElementById("driveStopButton");
    const stopButton = document.getElementById("stopButton");
    const statusElement = document.getElementById("status");
    const driveStatusElement = document.getElementById("driveStatus");
   /*
  基本映像として表示するvideo要素。

  既存コードとの互換性を保つため，
  変数名videoElementは今の段階では残す。
*/
const videoElement =
  document.getElementById("video");

/*
  小窓映像用video要素。
*/
const pipVideoElement =
  document.getElementById("pipVideo");

/*
  小窓全体。

  後でドラッグ移動と，
  ジョイスティック操作の除外判定に使用する。
*/
const pipVideoContainer =
  document.getElementById(
    "pipVideoContainer"
  );

  /*
  小窓右下のサイズ変更ハンドル。
*/
const pipResizeHandle =
  document.getElementById(
    "pipResizeHandle"
  );

/*
  両方の映像がOFFのときに，
  左下へ「映像OFF」と表示する。
*/
const videoOffIndicator =
  document.getElementById(
    "videoOffIndicator"
  );

const videoWrapper =
  document.getElementById("videoWrapper");

    /*
  映像の縦横サイズが確定したときに，
  STOPボタンの位置を必ず再計算する
*/
const pcFullscreenButton =
  document.getElementById(
    "pcFullscreenButton"
  );

const pcFullscreenIcon =
  document.getElementById(
    "pcFullscreenIcon"
  );

const joystickArea =
  document.getElementById("joystickArea");

const joystickKnob =
  document.getElementById("joystickKnob");

const fullscreenHoldIndicator =
  document.getElementById(
    "fullscreenHoldIndicator"
  );

    const xyDisplay = document.getElementById("xyDisplay");

    const settingsPanel =
  document.getElementById("settingsPanel");

const driveStopButtonText =
  document.getElementById("driveStopButtonText");

const stopResizeHandle =
  document.getElementById("stopResizeHandle");

const pcStopKey =
  document.getElementById("pcStopKey");

const stopButtonVisibleToggle =
  document.getElementById(
    "stopButtonVisibleToggle"
  );

const stopVisibilityState =
  document.getElementById(
    "stopVisibilityState"
  );

const themeModeToggle =
  document.getElementById("themeModeToggle");

const driveSpeedSelect =
  document.getElementById("driveSpeedSelect");

const headerBadgeDot =
  document.querySelector(".headerBadgeDot");

const bleConnectButton =
  document.getElementById(
    "bleConnectButton"
  );

const bleConnectionStatus =
  document.getElementById(
    "bleConnectionStatus"
  );

const bleStatusDot =
  document.getElementById(
    "bleStatusDot"
  );

    let joystickCenterX = 0;
let joystickCenterY = 0;

/*
  joystickActive:
  指が実際に動き，操縦が開始された状態
*/
let joystickActive = false;

/*
  joystickCandidate:
  指は置かれたが，まだ動いていない候補状態
*/
let joystickCandidate = false;

/*
  現在追跡している指
*/
let joystickPointerId = null;

/*
  指を置いた最初の座標
*/
let joystickPointerStartX = 0;
let joystickPointerStartY = 0;

/*
  誤差程度の動きでは操縦を開始しない
*/
const JOYSTICK_START_DISTANCE_PX = 12;

let driveStopped = false;
let driveSequence = 0;
    /*
  ジョイスティックを同じ位置で保持している間も，
  AtomS3 Liteのタイムアウト停止を起こさないよう，
  最新座標を一定間隔で送り続ける。
  PC・iPhone・小さい画面のすべてで共通して使用する。
*/
const DRIVE_COMMAND_REPEAT_INTERVAL_MS = 100;

let driveCommandRepeatTimer = null;
let currentDriveX = 0;
let currentDriveY = 0;

/*
  走行速度の倍率
  おそい：0.6
  ふつう：0.8
  はやい：1.0
*/
let driveSpeedScale = 0.25;

/*
  操縦用DataChannelの通信監視。
  0.5秒ごとに生存確認を送り，1.5秒間受信がなければ自動STOPする。
*/
const DRIVE_HEARTBEAT_INTERVAL_MS = 500;
const DRIVE_COMMUNICATION_TIMEOUT_MS = 1500;
const DRIVE_WATCHDOG_CHECK_INTERVAL_MS = 250;

let driveHeartbeatTimer = null;
let driveWatchdogTimer = null;
let lastDriveMessageReceivedAt = 0;
let communicationLossTriggered = false;

    let stopEditorActive = false;
let remoteSettingsActive = false;

let stopEditAction = null;

let stopEditStartX = 0;
let stopEditStartY = 0;

let stopEditStartLeft = 0;
let stopEditStartTop = 0;
let stopEditStartWidth = 0;
let stopEditStartHeight = 0;

    const joystickRadius = 70;
    const knobRadius = 25;
    const maxKnobDistance = joystickRadius - knobRadius;

     let role = null;
let socket = null;
let peerConnection = null;

/*
  自分のカメラ映像を保持するストリーム。

  現在のlocalStreamという名前は，
  既存コードとの互換性のため残す。
*/
let localStream = null;

/*
  相手から受信した映像トラックを保持する
  専用ストリーム。
*/
let remoteVideoStream = null;

/*
  映像送受信用のRTCRtpTransceiver。

  音声のlocalAudioTransceiverと同じ考え方で，
  後の段階で使用する。
*/
let localVideoTransceiver = null;

/*
  この端末のカメラ送信設定。

  初回標準値はroleによって変えるため，
  role決定後に設定する。
*/
let localCameraEnabled = false;

/*
  相手端末が通知してきたカメラ状態。
*/
let remoteCameraEnabled = false;

/*
  WebRTC接続が成立し，
  映像枠を表示してよい状態かどうか。

  falseの間は，大映像・小窓・
  「映像OFF」をすべて表示しない。
*/
let videoConnectionActive = false;

/*
  両方の映像がONのとき，
  自分の映像を大映像にするかどうか。
*/
let preferLocalVideoAsMain = false;

/*
  小窓の初期位置。
  PC・スマートフォンとも左上にする。
*/
let pipVideoPosition = {
  xRatio: 0.03,
  yRatio: 0.05
};
/*
  小窓の横幅。

  基本映像枠の横幅に対する割合で保持する。
  0.20～0.40の範囲で使用する。
*/
let pipVideoWidthRatio = 0.28;


/*
  小窓のサイズ変更中かどうか。
*/
let pipResizeActive = false;


/*
  サイズ変更に使用している指・マウスのID。
*/
let pipResizePointerId = null;


/*
  サイズ変更を始めた時点の情報。
*/
let pipResizeStartClientX = 0;
let pipResizeStartWidth = 0;

/*
  小窓をドラッグしている状態。
*/
let pipDragActive = false;
let pipDragPointerId = null;
let pipDragStartX = 0;
let pipDragStartY = 0;
let pipDragStartLeft = 0;
let pipDragStartTop = 0;

let offerStarted = false;
let driveChannel = null;

    // 「すべて切断」の確認応答待ち
    let disconnectAckTimer = null;
    let disconnectRequestPending = false;

    /*
      AtomS3 LiteのBLE設定
    */
    const BLE_DEVICE_NAME =
      "AtomS3-RC";

    const BLE_SERVICE_UUID =
      "4fa8691a-136d-4542-99c0-08d616844272";

    const BLE_CHARACTERISTIC_UUID =
      "beb5483e-36e1-4688-b7f5-ea07361b26a8";

    let bleDevice = null;
    let bleServer = null;
    let bleCharacteristic = null;
    let bleConnecting = false;

    /*
      BLE座標送信用キュー。
      ジョイスティック操作中に書き込みが重ならないよう，
      常に最新の座標だけを順番に送る。
    */
    let pendingBleCoordinates = null;
    let bleCoordinateWriteInProgress = false;
    /*
  WebRTCで受け取った停止座標の再送タイマー。
  新しい移動命令が来たら停止再送を中止する。
*/
let remoteStopResendTimer1 = null;
let remoteStopResendTimer2 = null;

    const rtcConfiguration = {
      iceServers: [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
          ]
        }
      ]
    };
