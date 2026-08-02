"use strict";

videoElement.addEventListener(
  "loadedmetadata",
  () => {
    scheduleStopButtonGeometryApply();
  }
);


videoElement.addEventListener(
  "playing",
  () => {
    scheduleStopButtonGeometryApply();
  }
);


/*
  小窓の映像サイズが確定したら，
  保存位置を現在の映像枠へ再適用する。
*/
pipVideoElement.addEventListener(
  "loadedmetadata",
  () => {
    applyPipVideoPosition();
  }
);

pipVideoElement.addEventListener(
  "playing",
  () => {
    applyPipVideoPosition();
  }
);


/*
  BLE接続表示を更新する
*/

/*
  WebRTCまたはBLEのどちらかが接続中なら、
  「すべて切断」を使用可能にする
*/

/*
  AtomS3 LiteとのBLE接続が切れたとき
*/

/*
  AtomS3 LiteへBLE接続する
*/

/*
  AtomS3 LiteとのBLE接続を終了する
*/

    /*
  BLE接続ボタンを、
  接続中はBLE切断ボタンとして動作させる
*/

/* ======================================
   操縦用DataChannel 共通処理
====================================== */





/*
  相手からDataChannelのデータを受け取った時刻を更新する。
  通信が戻っても安全のためSTOP状態は自動解除しない。
*/

/*
  通信途絶を検出した場合の安全停止。
  一度STOPした後は，利用者が明示的に「解除」を押すまで再開しない。
*/



/*
  通信途絶を検出した場合の安全停止を一元管理する。
  通信が戻っても，利用者が明示的に「解除」を押すまで解除しない。
*/








/*
  相手が同じ部屋へ入り直したとき，
  古いWebRTC接続だけを片付けて作り直す。

  WebSocket，カメラ，BLEは維持する。
*/









/*
  映像枠を押したときの処理。

  1. iPhoneなどでは，送信側・受信側のどちらでも
     右下長押しによる全画面アイコン表示を開始する。
  2. 受信側だけは，これとは別にジョイスティック候補を開始する。
*/
videoWrapper.addEventListener(
  "pointerdown",
  event => {

    /*
      STOPボタンや全画面ボタン自体を押した場合は，
      長押し判定とジョイスティックを開始しない。
    */
   if (
  event.target.closest(
    "#driveStopButton, " +
    "#pcFullscreenButton, " +
    "#pipVideoContainer"
  )
) {
  return;
}

    /*
      送信側・受信側のどちらでも，
      iPhoneの右下長押し判定を開始できる。
    */
    startMobileFullscreenHold(event);

    /*
  詳細設定中でも全画面長押しは有効にする。
  ただし，ジョイスティック操作は開始しない。
*/
if (
  settingsPanel.open ||
  stopEditorActive
) {
  return;
}

    /*
      送信側・受信側，PC・iPhoneのどれでも
      ジョイスティックを使用できる。
    */
    if (driveStopped) {
      return;
    }

    /* すでに別の指を追跡している場合は無視する */
    if (joystickPointerId !== null) {
      return;
    }

    if (
      event.pointerType === "touch" ||
      event.pointerType === "pen"
    ) {
      event.preventDefault();
    }

    const rect =
      videoWrapper.getBoundingClientRect();

    const pointerX =
      event.clientX - rect.left;

    const pointerY =
      event.clientY - rect.top;

    /* ジョイスティックの中心位置を映像枠内に収める */
    joystickCenterX = Math.max(
      joystickRadius,
      Math.min(
        rect.width - joystickRadius,
        pointerX
      )
    );

    joystickCenterY = Math.max(
      joystickRadius,
      Math.min(
        rect.height - joystickRadius,
        pointerY
      )
    );

    joystickPointerId = event.pointerId;
    joystickPointerStartX = event.clientX;
    joystickPointerStartY = event.clientY;

    joystickCandidate = true;
    joystickActive = false;

    joystickKnob.style.left = "50%";
    joystickKnob.style.top = "50%";

    xyDisplay.textContent = "X：0.00　Y：0.00";

    joystickArea.style.left =
      joystickCenterX + "px";

    joystickArea.style.top =
      joystickCenterY + "px";

    joystickArea.style.display = "block";

    try {
      videoWrapper.setPointerCapture(
        event.pointerId
      );
    } catch (error) {
      console.log(
        "Pointer Captureを設定できませんでした。",
        error
      );
    }
  }
);

/*
  現在保持している操縦座標を，
  この端末のBLEとWebRTCの相手側へ送る。
*/

/*
  座標の定期送信を停止する。
*/

/*
  最新座標を保存し，直ちに1回送信したうえで，
  同じ位置で保持されていても100msごとに送り続ける。
*/





  settingsPanel.addEventListener(
  "toggle",
  async () => {

    if (settingsPanel.open) {

      /*
        詳細設定を開いたら操縦を停止し，
        STOPボタン編集を開始する
      */
      stopDrivingForSettings();
      startStopButtonEditor();

    } else {

      /*
        詳細設定を閉じたら，
        STOPボタン設定を保存して編集終了
      */
      await finishStopButtonEditor();

       const settingsSummary =
    settingsPanel.querySelector("summary");

  if (settingsSummary instanceof HTMLElement) {
    settingsSummary.blur();
  }

      /*
        自分側の詳細設定を閉じたため，
        相手側も詳細設定中でなければ
        ボタン状態を戻す
      */
      updateDriveStopButtonAvailability();

      /*
        詳細設定を閉じたことは，
        非常停止状態に関係なく相手へ通知する。
      */
      sendSettingsState(false);

      /*
        詳細設定終了後も非常停止は自動解除しない。
        利用者が「解除」を押したときだけ解除する。
      */
      if (driveStopped) {
        driveStatusElement.textContent =
          "詳細設定を終了しました。「解除」を押すと操縦を再開できます。";
      }
    }
  }
);





/*
  操縦座標をAtomS3 LiteへBLE送信する。
  WebRTCの送信側・受信側，PC・iPhoneに関係なく，
  この端末がBLE接続中なら送信する。
*/



  videoWrapper.addEventListener(
  "pointermove",
  event => {

    if (
      !joystickCandidate ||
      joystickPointerId !== event.pointerId ||
      driveStopped ||
      settingsPanel.open ||
      stopEditorActive
    ) {
      return;
    }

    /*
      指を置いた位置から
      どれだけ動いたかを調べる
    */

    const movementFromStart =
      Math.hypot(
        event.clientX - joystickPointerStartX,
        event.clientY - joystickPointerStartY
      );

    /*
      12px未満は手指の揺れとして扱う
    */

    if (
      !joystickActive &&
      movementFromStart <
        JOYSTICK_START_DISTANCE_PX
    ) {
      return;
    }

    /*
      初めて動いた時点で，
      ジョイスティック操作を開始する
    */

    if (!joystickActive) {

      joystickActive = true;

      joystickArea.style.left =
        joystickCenterX + "px";

      joystickArea.style.top =
        joystickCenterY + "px";

      joystickArea.style.display = "block";
    }

    event.preventDefault();

    const rect =
      videoWrapper.getBoundingClientRect();

    const pointerX =
      event.clientX - rect.left;

    const pointerY =
      event.clientY - rect.top;

    let dx =
      pointerX - joystickCenterX;

    let dy =
      pointerY - joystickCenterY;

    const distance =
      Math.hypot(dx, dy);

    /*
      ノブが外周を越えないようにする
    */

    if (distance > maxKnobDistance) {

      dx =
        dx / distance *
        maxKnobDistance;

      dy =
        dy / distance *
        maxKnobDistance;
    }

    joystickKnob.style.left =
      (joystickRadius + dx) + "px";

    joystickKnob.style.top =
      (joystickRadius + dy) + "px";

    const x =
      dx / maxKnobDistance;

    const y =
      -dy / maxKnobDistance;

    xyDisplay.textContent =
      "X：" + x.toFixed(2) +
      "　Y：" + y.toFixed(2);

    const roundedX = Number(x.toFixed(2));
    const roundedY = Number(y.toFixed(2));

/*
  座標が変化した時に即時送信し，
  その後マウスや指が同じ位置で止まっていても，
  同じ座標を100msごとに送り続ける。
*/
updateAndRepeatDriveCoordinates(
  roundedX,
  roundedY
);
  }
);

/*
  ジョイスティック操作または候補状態を終了する
*/


videoWrapper.addEventListener(
  "pointerup",
  event => {
    finishJoystickPointer(event, false);
  }
);

videoWrapper.addEventListener(
  "pointercancel",
  event => {
    finishJoystickPointer(event, true);
  }
);

    /*
  映像枠の外でマウスや指を離した場合も，
  必ずジョイスティックを中央へ戻して停止する
*/
window.addEventListener(
  "pointerup",
  event => {
    finishJoystickPointer(event, false);
  }
);

window.addEventListener(
  "pointercancel",
  event => {
    finishJoystickPointer(event, true);
  }
);

videoWrapper.addEventListener(
  "lostpointercapture",
  event => {
    finishJoystickPointer(event, true);
  }
);

/*
  iPhone/Safariで長押し中にページ選択へ渡さない。
  映像枠内だけに限定し，ボタン上では実行しない。
*/
videoWrapper.addEventListener(
  "touchstart",
  event => {
    if (
      !event.target.closest(
        "#driveStopButton, " +
        "#pcFullscreenButton, " +
        "#pipVideoContainer"
      )
    ) {
      event.preventDefault();
    }
  },
  { passive: false }
);

videoWrapper.addEventListener(
  "touchmove",
  event => {
    if (
      !event.target.closest(
        "#driveStopButton, " +
        "#pcFullscreenButton, " +
        "#pipVideoContainer"
      )
    ) {
      event.preventDefault();
    }
  },
  { passive: false }
);

/*
  iPhoneで3秒長押ししたときに，
  画像保存などのメニューが出るのを防ぐ
*/

videoWrapper.addEventListener(
  "contextmenu",
  event => {
    event.preventDefault();
  }
);

/*
  Safariの長押しによる範囲選択・ドラッグ開始を防ぐ
*/
videoWrapper.addEventListener(
  "selectstart",
  event => {
    event.preventDefault();
  }
);

videoWrapper.addEventListener(
  "dragstart",
  event => {
    event.preventDefault();
  }
);

sendButton.addEventListener(
  "click",
  startSender
);

viewButton.addEventListener(
  "click",
  startViewer
);

bleConnectButton.addEventListener(
  "click",
  toggleBleConnection
);


driveStopButton.addEventListener(
  "pointerdown",
  toggleDriveStop
);


// ======================================
// 小窓（PiP）のドラッグ移動
// ======================================

const PIP_POSITION_STORAGE_KEY =
  "pipVideoPositionV2";

  /*
  小窓サイズの保存名。
*/
const PIP_SIZE_STORAGE_KEY =
  "pipVideoSizeV1";


/*
  PCでは最小10％，
  スマートフォンでは最小20％にする。
*/
function getPipMinimumWidthRatio() {

  return window.matchMedia(
    "(max-width: 700px)"
  ).matches
    ? 0.20
    : 0.10;
}


function clampPipWidthRatio(value) {

  return Math.min(
    0.40,
    Math.max(
      getPipMinimumWidthRatio(),
      value
    )
  );
}


/*
  保存されている割合から，
  小窓の大きさを現在の映像枠へ反映する。
*/
function applyPipVideoSize() {

  const wrapperRect =
    videoWrapper.getBoundingClientRect();

  if (wrapperRect.width <= 0) {
    return;
  }

  /*
    最大420pxを超えないようにする。
  */
  const widthPx =
    Math.min(
      wrapperRect.width *
        clampPipWidthRatio(
          pipVideoWidthRatio
        ),
      420
    );

  pipVideoContainer.style.width =
    `${widthPx}px`;

  pipVideoContainer.style.height =
    "auto";

  /*
    サイズ変更後に画面外へ出ないよう，
    保存位置を再計算する。
  */
  requestAnimationFrame(
    applyPipVideoPosition
  );
}


/*
  小窓サイズをブラウザへ保存する。
*/
function savePipVideoSize() {

  localStorage.setItem(
    PIP_SIZE_STORAGE_KEY,
    String(pipVideoWidthRatio)
  );
}


/*
  保存済みの小窓サイズを読み込む。
*/
function loadPipVideoSize() {

  const saved =
    Number(
      localStorage.getItem(
        PIP_SIZE_STORAGE_KEY
      )
    );

  if (Number.isFinite(saved) &&
      saved > 0) {

    pipVideoWidthRatio =
      clampPipWidthRatio(saved);
  }

  requestAnimationFrame(
    applyPipVideoSize
  );
}

/*
  数値を0～1へ収める。
*/
function clampPipPositionRatio(value) {

  return Math.min(
    1,
    Math.max(0, value)
  );
}


/*
  保存されている比率から，
  現在の映像枠内での小窓位置を計算する。
*/
function applyPipVideoPosition() {

  if (
    pipVideoContainer.classList.contains(
      "hidden"
    )
  ) {
    return;
  }

  const wrapperRect =
    videoWrapper.getBoundingClientRect();

  const pipRect =
    pipVideoContainer.getBoundingClientRect();

  if (
    wrapperRect.width <= 0 ||
    wrapperRect.height <= 0 ||
    pipRect.width <= 0 ||
    pipRect.height <= 0
  ) {
    return;
  }

  const maximumLeft =
    Math.max(
      0,
      wrapperRect.width -
        pipRect.width
    );

  const maximumTop =
    Math.max(
      0,
      wrapperRect.height -
        pipRect.height
    );

  const leftPx =
    maximumLeft *
    clampPipPositionRatio(
      pipVideoPosition.xRatio
    );

  const topPx =
    maximumTop *
    clampPipPositionRatio(
      pipVideoPosition.yRatio
    );

  /*
    CSSのright指定ではなく，
    ドラッグ後はleft・topで位置を管理する。
  */
  pipVideoContainer.style.right =
    "auto";

  pipVideoContainer.style.bottom =
    "auto";

  pipVideoContainer.style.left =
    `${leftPx}px`;

  pipVideoContainer.style.top =
    `${topPx}px`;
}


/*
  小窓の位置をブラウザへ保存する。
*/
function savePipVideoPosition() {

  localStorage.setItem(
    PIP_POSITION_STORAGE_KEY,
    JSON.stringify(
      pipVideoPosition
    )
  );
}


/*
  保存済みの小窓位置を読み込む。
*/
function loadPipVideoPosition() {

  const saved =
    localStorage.getItem(
      PIP_POSITION_STORAGE_KEY
    );

  if (saved) {

    try {

      const parsed =
        JSON.parse(saved);

      if (
        Number.isFinite(
          parsed.xRatio
        ) &&
        Number.isFinite(
          parsed.yRatio
        )
      ) {

        pipVideoPosition = {
          xRatio:
            clampPipPositionRatio(
              parsed.xRatio
            ),

          yRatio:
            clampPipPositionRatio(
              parsed.yRatio
            )
        };
      }

    } catch (error) {

      console.error(
        "小窓位置の読み込みに失敗しました。",
        error
      );
    }
  }

  requestAnimationFrame(
    applyPipVideoPosition
  );
}

/*
  小窓右下のハンドルを押したとき，
  サイズ変更を開始する。
*/
pipResizeHandle.addEventListener(
  "pointerdown",
  event => {

    if (
      pipVideoContainer.classList.contains(
        "hidden"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    /*
      小窓の移動操作とは同時に行わない。
    */
    pipDragActive = false;
    pipDragPointerId = null;

    pipResizeActive = true;
    pipResizePointerId =
      event.pointerId;

    pipResizeStartClientX =
      event.clientX;

    pipResizeStartWidth =
      pipVideoContainer
        .getBoundingClientRect()
        .width;

    try {

      pipResizeHandle.setPointerCapture(
        event.pointerId
      );

    } catch (error) {

      console.log(
        "小窓サイズ変更のPointer Captureを" +
        "設定できませんでした。",
        error
      );
    }
  }
);

/*
  指またはマウスの移動に合わせて，
  小窓の大きさを変更する。
*/
window.addEventListener(
  "pointermove",
  event => {

    if (
      !pipResizeActive ||
      pipResizePointerId !==
        event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    const wrapperRect =
      videoWrapper.getBoundingClientRect();

    if (wrapperRect.width <= 0) {
      return;
    }

    const deltaX =
      event.clientX -
      pipResizeStartClientX;

    const requestedWidthPx =
      pipResizeStartWidth +
      deltaX;

    const minimumWidthPx =
     wrapperRect.width *
      getPipMinimumWidthRatio();

    const maximumWidthPx =
      Math.min(
        wrapperRect.width * 0.40,
        420
      );

    const newWidthPx =
      Math.min(
        maximumWidthPx,
        Math.max(
          minimumWidthPx,
          requestedWidthPx
        )
      );

    pipVideoWidthRatio =
      clampPipWidthRatio(
        newWidthPx /
        wrapperRect.width
      );

    applyPipVideoSize();
  },
  {
    passive: false
  }
);


/*
  小窓のサイズ変更を終了し，
  最後の大きさを保存する。
*/
function finishPipResize(event) {

  if (
    !pipResizeActive ||
    pipResizePointerId !==
      event.pointerId
  ) {
    return;
  }

  pipResizeActive = false;
  pipResizePointerId = null;

  savePipVideoSize();
  savePipVideoPosition();
}


window.addEventListener(
  "pointerup",
  finishPipResize
);

window.addEventListener(
  "pointercancel",
  finishPipResize
);

/*
  小窓を押した時点から，
  小窓専用のドラッグ操作を開始する。
*/
pipVideoContainer.addEventListener(
  "pointerdown",
  event => {

    if (
      pipVideoContainer.classList.contains(
        "hidden"
      )
    ) {
      return;
    }
    if (
  event.target.closest(
    "#pipResizeHandle"
  )
) {
  return;
}

    event.preventDefault();
    event.stopPropagation();

    pipDragActive = true;

    pipDragPointerId =
      event.pointerId;

    pipDragStartX =
      event.clientX;

    pipDragStartY =
      event.clientY;

    const wrapperRect =
      videoWrapper.getBoundingClientRect();

    const pipRect =
      pipVideoContainer
        .getBoundingClientRect();

    pipDragStartLeft =
      pipRect.left -
      wrapperRect.left;

    pipDragStartTop =
      pipRect.top -
      wrapperRect.top;

    try {

      pipVideoContainer
        .setPointerCapture(
          event.pointerId
        );

    } catch (error) {

      console.log(
        "小窓のPointer Captureを" +
        "設定できませんでした。",
        error
      );
    }
  }
);


/*
  指またはマウスの移動に合わせて
  小窓を移動する。
*/
window.addEventListener(
  "pointermove",
  event => {

    if (
      !pipDragActive ||
      pipDragPointerId !==
        event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    const wrapperRect =
      videoWrapper.getBoundingClientRect();

    const pipRect =
      pipVideoContainer
        .getBoundingClientRect();

    if (
      wrapperRect.width <= 0 ||
      wrapperRect.height <= 0
    ) {
      return;
    }

    const maximumLeft =
      Math.max(
        0,
        wrapperRect.width -
          pipRect.width
      );

    const maximumTop =
      Math.max(
        0,
        wrapperRect.height -
          pipRect.height
      );

    const newLeftPx =
      Math.min(
        maximumLeft,
        Math.max(
          0,
          pipDragStartLeft +
          event.clientX -
          pipDragStartX
        )
      );

    const newTopPx =
      Math.min(
        maximumTop,
        Math.max(
          0,
          pipDragStartTop +
          event.clientY -
          pipDragStartY
        )
      );

    pipVideoPosition.xRatio =
      maximumLeft > 0
        ? newLeftPx /
          maximumLeft
        : 0;

    pipVideoPosition.yRatio =
      maximumTop > 0
        ? newTopPx /
          maximumTop
        : 0;

    applyPipVideoPosition();
  },
  {
    passive: false
  }
);


/*
  小窓のドラッグを終了し，
  最後の位置を保存する。
*/
function finishPipDrag(event) {

  if (
    !pipDragActive ||
    pipDragPointerId !==
      event.pointerId
  ) {
    return;
  }

  pipDragActive = false;
  pipDragPointerId = null;

  savePipVideoPosition();
}


window.addEventListener(
  "pointerup",
  finishPipDrag
);

window.addEventListener(
  "pointercancel",
  finishPipDrag
);


// ======================================
// STOPボタンの位置・サイズ編集
// 現在はPC通常画面・PC全画面を対象
// ======================================

const STOP_GEOMETRY_STORAGE_KEY =
  "driveStopButtonGeometryV2";

/*
  幅・高さはpxで保存する。
  xRatio・yRatioは，ボタンが移動できる範囲内での位置。
  0 = 左端・上端
  1 = 右端・下端
*/
let stopButtonGeometry = {
  xRatio: 0.94,
  yRatio: 0.05,
  widthPx: 180,
  heightPx: 72
};

let videoWasPlayingBeforeStopEdit = false;

/*
  数値を指定範囲内へ収める
*/

/*
  保存されている大きさと位置を画面へ反映する
*/

/*
  レイアウト変更が完了したあとに再反映する
*/

    /*
  縦横回転・ブラウザバー・全画面切替などで
  videoWrapperの大きさが変化した場合，
  STOPボタンを必ず画面内へ再配置する
*/
if (window.ResizeObserver) {

  const stopButtonResizeObserver =
  new ResizeObserver(
    () => {
      scheduleStopButtonGeometryApply();
      applyPipVideoSize();
      applyPipVideoPosition();
    }
  );

  stopButtonResizeObserver.observe(
    videoWrapper
  );
}

/*
  位置・サイズをブラウザへ保存する
*/

/*
  保存済みの位置・サイズを読み込む
*/

/*
  STOPボタン編集を開始
*/
/*
  詳細設定を開いたとき，
  STOPボタン編集を開始する
*/

/*
  STOPボタン編集を終了
*/
/*
  詳細設定を閉じたとき，
  STOPボタン編集を終了して保存する
*/

/*
  STOPボタン本体を押したとき，
  移動編集を開始
*/
driveStopButton.addEventListener(
  "pointerdown",
  event => {

    if (!stopEditorActive) {
      return;
    }

    /*
      右下のリサイズハンドルを押した場合は，
      移動処理を開始しない
    */
    if (
      event.target.closest(
        "#stopResizeHandle"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    stopEditAction = "move";

    stopEditStartX = event.clientX;
    stopEditStartY = event.clientY;

const wrapperRect =
  videoWrapper.getBoundingClientRect();

const buttonRect =
  driveStopButton.getBoundingClientRect();

stopEditStartLeft =
  buttonRect.left - wrapperRect.left;

stopEditStartTop =
  buttonRect.top - wrapperRect.top;

driveStopButton.setPointerCapture(
  event.pointerId
);
  }
);

/*
  右下の矢印を押したとき，
  サイズ変更を開始
*/
stopResizeHandle.addEventListener(
  "pointerdown",
  event => {

    if (!stopEditorActive) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    stopEditAction = "resize";

    stopEditStartX = event.clientX;
    stopEditStartY = event.clientY;

  const wrapperRect =
  videoWrapper.getBoundingClientRect();

const buttonRect =
  driveStopButton.getBoundingClientRect();

stopEditStartLeft =
  buttonRect.left - wrapperRect.left;

stopEditStartTop =
  buttonRect.top - wrapperRect.top;

stopEditStartWidth =
  buttonRect.width;

stopEditStartHeight =
  buttonRect.height;

    stopResizeHandle.setPointerCapture(
      event.pointerId
    );
  }
);

/*
  マウスまたは指を動かしたとき，
  移動・サイズ変更を反映
*/
window.addEventListener(
  "pointermove",
  event => {

    if (
      !stopEditorActive ||
      !stopEditAction
    ) {
      return;
    }

    event.preventDefault();

    const wrapperRect =
      videoWrapper.getBoundingClientRect();

    if (
      wrapperRect.width <= 0 ||
      wrapperRect.height <= 0
    ) {
      return;
    }

    const deltaX =
      event.clientX - stopEditStartX;

    const deltaY =
      event.clientY - stopEditStartY;

    /*
      STOPボタンの移動
    */
    if (stopEditAction === "move") {

      const buttonRect =
        driveStopButton.getBoundingClientRect();

      const maximumLeft =
        wrapperRect.width -
        buttonRect.width;

      const maximumTop =
        wrapperRect.height -
        buttonRect.height;

      const newLeftPx =
        clampStopEditValue(
          stopEditStartLeft + deltaX,
          0,
          maximumLeft
        );

      const newTopPx =
        clampStopEditValue(
          stopEditStartTop + deltaY,
          0,
          maximumTop
        );

     /*
  画面全体に対する割合ではなく，
  ボタンが移動可能な範囲内での位置を保存する
*/
stopButtonGeometry.xRatio =
  maximumLeft > 0
    ? newLeftPx / maximumLeft
    : 0;

stopButtonGeometry.yRatio =
  maximumTop > 0
    ? newTopPx / maximumTop
    : 0;

applyStopButtonGeometry();
    }

    /*
      STOPボタンのサイズ変更
    */
    if (stopEditAction === "resize") {

     /*
  サイズ変更中は，開始時の左上位置を固定する
*/
const buttonLeft =
  stopEditStartLeft;

const buttonTop =
  stopEditStartTop;

const maximumWidth =
  wrapperRect.width -
  buttonLeft;

const maximumHeight =
  wrapperRect.height -
  buttonTop;

      const minimumWidth =
        Math.min(
          100,
          wrapperRect.width
        );

      const minimumHeight =
        Math.min(
          52,
          wrapperRect.height
        );

      const newWidthPx =
        clampStopEditValue(
          stopEditStartWidth + deltaX,
          minimumWidth,
          maximumWidth
        );

      const newHeightPx =
        clampStopEditValue(
          stopEditStartHeight + deltaY,
          minimumHeight,
          maximumHeight
        );

      /*
  幅・高さは％ではなくpxで保存する
*/
stopButtonGeometry.widthPx =
  newWidthPx;

stopButtonGeometry.heightPx =
  newHeightPx;

/*
  サイズ変更により移動可能範囲が変わるため，
  現在位置も新しい範囲に対する割合へ更新する
*/
const newMaximumLeft =
  Math.max(
    0,
    wrapperRect.width -
    newWidthPx
  );

const newMaximumTop =
  Math.max(
    0,
    wrapperRect.height -
    newHeightPx
  );

stopButtonGeometry.xRatio =
  newMaximumLeft > 0
    ? buttonLeft /
      newMaximumLeft
    : 0;

stopButtonGeometry.yRatio =
  newMaximumTop > 0
    ? buttonTop /
      newMaximumTop
    : 0;

stopButtonGeometry.xRatio =
  clampStopEditValue(
    stopButtonGeometry.xRatio,
    0,
    1
  );

stopButtonGeometry.yRatio =
  clampStopEditValue(
    stopButtonGeometry.yRatio,
    0,
    1
  );

applyStopButtonGeometry();
    }
  },
  { passive: false }
);

/*
  マウスまたは指を離したら編集操作を終了
*/

window.addEventListener(
  "pointerup",
  finishStopEditPointerAction
);

window.addEventListener(
  "pointercancel",
  finishStopEditPointerAction
);

stopButton.addEventListener(
  "click",
  disconnectBoth
);

    // ======================================
// 映像の全画面表示
// PC・iPhone共通
// ======================================

const mobileFullscreenMedia =
  window.matchMedia("(max-width: 700px)");

const mobileCoarsePointerMedia =
  window.matchMedia("(pointer: coarse)");

/*
  スマートフォンの右下長押し判定。
  ジョイスティックとは独立して管理する。
*/
let mobileFullscreenHoldTimer = null;
let mobileFullscreenColorTimer = null;
let mobileFullscreenHoldPointerId = null;
let mobileFullscreenHoldStartX = 0;
let mobileFullscreenHoldStartY = 0;
let mobileFullscreenHoldTriggered = false;

let mobileFullscreenHideTimer = null;

/*
  右下を3秒間押し続けると，
  全画面アイコンを表示する
*/

const MOBILE_FULLSCREEN_HOLD_MS = 3000;

/*
  400ミリ秒以上，ほぼ動かずに押し続けた場合だけ，
  長押し候補として黄色への変化を開始する
*/
const MOBILE_FULLSCREEN_COLOR_DELAY_MS = 400;

const MOBILE_FULLSCREEN_ZONE_SIZE_PX = 120;
const MOBILE_FULLSCREEN_VISIBLE_MS = 4000;

/* アイコン表示直後の誤操作防止時間 */
const MOBILE_FULLSCREEN_LOCK_MS = 1000;

let mobileFullscreenButtonLocked = false;
let mobileFullscreenLockTimer = null;

/*
  iPhoneなどの画面幅かどうか
*/


/*
  右下長押し専用サインを消す
*/

/*
  右下長押し判定を中止する
*/

/*
  送信側・受信側のどちらでも，
  右下長押しによる全画面アイコン表示を開始する
*/

videoWrapper.addEventListener(
  "pointermove",
  event => {
    if (
      mobileFullscreenHoldPointerId !==
        event.pointerId ||
      mobileFullscreenHoldTriggered
    ) {
      return;
    }

    const movement =
      Math.hypot(
        event.clientX -
          mobileFullscreenHoldStartX,
        event.clientY -
          mobileFullscreenHoldStartY
      );

    if (
      movement >=
        JOYSTICK_START_DISTANCE_PX
    ) {
      cancelMobileFullscreenHold();
    }
  }
);


videoWrapper.addEventListener(
  "pointerup",
  finishMobileFullscreenHold
);

videoWrapper.addEventListener(
  "pointercancel",
  finishMobileFullscreenHold
);

/*
  iPhone用の疑似全画面中かどうか
*/


/*
  全画面アイコンの表示を更新
*/


/*
  iPhone用の全画面アイコンを隠す
*/


/*
  iPhone用の全画面アイコンを数秒だけ表示
*/


/*
  全画面へ入る直前に
  現在のSTOPボタン設定を保存する
*/

/*
  通常画面へ戻ったあとの
  videoWrapperサイズで再配置する
*/

/*
  iPhone用の疑似全画面を開始
*/

/*
  iPhone版Chromeを含むモバイルブラウザで，
  疑似全画面を実際に見えている範囲へ合わせる
*/



/*
  iPhone用の疑似全画面を終了
*/


/*
  全画面と通常表示を切り替える
*/


/*
  全画面ボタンを押したとき，
  背後のジョイスティック操作を発生させない
*/

pcFullscreenButton.addEventListener(
  "pointerdown",
  event => {

    event.preventDefault();
    event.stopPropagation();

    /*
      アイコン表示直後の連続タップは無視する
    */

    if (
      isMobileFullscreenLayout() &&
      mobileFullscreenButtonLocked
    ) {
      event.stopImmediatePropagation();
    }
  }
);

pcFullscreenButton.addEventListener(
  "click",
  event => {

    event.preventDefault();
    event.stopPropagation();

    /*
      アイコンが表示されてから1秒間は，
      全画面への切り替えを実行しない
    */

    if (
      isMobileFullscreenLayout() &&
      mobileFullscreenButtonLocked
    ) {
      return;
    }

    togglePcFullscreen();
  }
);

/*
  本当の全画面表示が変化したとき
*/

document.addEventListener(
  "fullscreenchange",
  () => {

    const isFullscreen =
      document.fullscreenElement ===
      videoWrapper;

   if (isFullscreen) {

  updateFullscreenIcon(true);

  /*
    全画面化後のvideoWrapperサイズで
    STOPボタンを再配置する
  */
  scheduleStopButtonGeometryApply();

} else {

  updateFullscreenIcon(false);

  /*
    通常画面へ戻ったあとのサイズで
    STOPボタンを再配置する
  */
  scheduleStopButtonGeometryApply();
}

    hideMobileFullscreenButton();
  }
);

    /*
  iPhoneを縦向き・横向きに変更したあと，
  疑似全画面とボタンの状態を整える
*/


window.addEventListener(
  "orientationchange",
  refreshMobileFullscreenAfterRotation
);

/*
  iPhone Safariではorientationchange以外に，
  resizeだけが発生する場合もある
*/

window.addEventListener(
  "resize",
  refreshMobileFullscreenAfterRotation
);

    /*
  iPhone版Chromeでブラウザバーやタブ表示により
  実際に見えている範囲が変化したときの補正
*/

if (window.visualViewport) {

  window.visualViewport.addEventListener(
    "resize",
    () => {

      if (isMobilePseudoFullscreen()) {
        updateMobilePseudoFullscreenViewport();
      }

      scheduleStopButtonGeometryApply();
    }
  );

  window.visualViewport.addEventListener(
    "scroll",
    () => {

      if (isMobilePseudoFullscreen()) {
        updateMobilePseudoFullscreenViewport();
      }

      scheduleStopButtonGeometryApply();
    }
  );
}

window.addEventListener(
  "beforeunload",
  () => {
    /*
      ページ離脱時も非常停止状態を解除しない。
      相手側ではWebSocket切断・peer-leftにより
      非常停止状態へ移行する。
    */
    stopAll(
      false,
      {
        preserveEmergencyStop: true
      }
    );
  }
);

    // ======================================
// 詳細設定の保存
// ======================================




// ----------
// 変更されたら保存
// ----------

pcStopKey.addEventListener(
  "change",
  () => {
    saveSettings();

    // 選択後にプルダウンのフォーカスを外す
    pcStopKey.blur();
  }
);
stopButtonVisibleToggle.addEventListener(
  "change",
  () => {
    applyStopButtonVisibility();
    saveSettings();
  }
);

// ======================================
// パソコンのキーによるSTOP・解除
// ======================================

window.addEventListener(
  "keydown",
  event => {

    const selectedStopKey =
      pcStopKey.value;

    // 「使用しない」の場合
    if (selectedStopKey === "None") {
      return;
    }

    // 選択したキー以外では何もしない
    if (event.code !== selectedStopKey) {
      return;
    }

    // キー長押しによる連続実行を防ぐ
    if (event.repeat) {
      return;
    }

    /*
      Space・Enterによる，
      ボタン押下やプルダウン操作などの
      ブラウザ標準動作を先に止める
    */
    event.preventDefault();

    const target = event.target;

    // 入力欄・プルダウン操作中はSTOPしない
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }

   // 詳細設定のsummaryなどに残ったフォーカスを解除する
const activeElement =
  document.activeElement;

if (
  activeElement instanceof HTMLElement &&
  activeElement !== document.body
) {
  activeElement.blur();
}

    // STOPボタンが使用できない状態
    if (driveStopButton.disabled) {
      return;
    }

    toggleDriveStop(event);
  }
);

// ======================================
// 背景テーマ切り替え・保存
// ======================================

const THEME_MODE_STORAGE_KEY =
  "themeModeLight";


/*
  現在のテーマ設定を画面へ反映する。
*/
function applyThemeMode() {

  document.body.classList.toggle(
    "lightTheme",
    themeModeToggle.checked
  );

  const themeToggleText =
    document.querySelector(
      ".themeToggleText"
    );

  if (
    themeToggleText instanceof
      HTMLElement
  ) {

    if (themeModeToggle.checked) {
      themeToggleText.textContent =
        "ライト";
    } else {
      themeToggleText.textContent =
        "ダーク";
    }
  }
}


/*
  保存されている画面テーマを読み込む。
*/
function loadThemeMode() {

  const savedTheme =
    localStorage.getItem(
      THEME_MODE_STORAGE_KEY
    );

  if (savedTheme !== null) {

    themeModeToggle.checked =
      savedTheme === "true";
  }

  applyThemeMode();
}


/*
  テーマを変更したら保存する。
*/
themeModeToggle.addEventListener(
  "change",
  () => {

    applyThemeMode();

    localStorage.setItem(
      THEME_MODE_STORAGE_KEY,
      String(
        themeModeToggle.checked
      )
    );
  }
);


// ======================================
// 走行速度の保存
// ======================================

const DRIVE_SPEED_STORAGE_KEY =
  "driveSpeedScale";


/*
  保存されている走行速度を読み込む。
*/
function loadDriveSpeed() {

  const savedSpeed =
    localStorage.getItem(
      DRIVE_SPEED_STORAGE_KEY
    );

  if (savedSpeed !== null) {

    const optionExists =
      Array.from(
        driveSpeedSelect.options
      ).some(
        option =>
          option.value === savedSpeed
      );

    if (optionExists) {

      driveSpeedSelect.value =
        savedSpeed;
    }
  }

  driveSpeedScale =
    Number(
      driveSpeedSelect.value
    ) || 0.25;
}


/*
  走行速度を変更したら保存する。
*/
driveSpeedSelect.addEventListener(
  "change",
  () => {

    driveSpeedScale =
      Number(
        driveSpeedSelect.value
      ) || 0.25;

    localStorage.setItem(
      DRIVE_SPEED_STORAGE_KEY,
      driveSpeedSelect.value
    );

    console.log(
      "走行速度を変更:",
      driveSpeedSelect.options[
        driveSpeedSelect.selectedIndex
      ].text,
      "倍率:",
      driveSpeedScale
    );
  }
);


// ----------
// 起動時に読み込み
// ----------

loadSettings();
loadStopButtonGeometry();
loadPipVideoSize();
loadPipVideoPosition();
loadThemeMode();
loadDriveSpeed();
