"use strict";

function setStatus(message) {
      statusElement.textContent = message;
      console.log(message);
    }


function setControlsConnected() {
  sendButton.disabled = true;
  viewButton.disabled = true;
  roomInput.disabled = true;

  joystickActive = false;

  /*
    再接続時は非常停止状態を初期化しない。
    通信断前に「解除」表示だった場合は，その状態を保持する。
  */
  driveStopButton.disabled = true;
  applyDriveStopState(driveStopped);

    updateAllDisconnectButtonAvailability();

  // 接続処理を開始した時点では黄色
  headerBadgeDot.classList.remove(
    "connected"
  );

  headerBadgeDot.classList.add(
    "connecting"
  );
}


function setControlsDisconnected() {
  sendButton.disabled = false;
  viewButton.disabled = false;

  sendButton.classList.remove("selectedRole");
  viewButton.classList.remove("selectedRole");
  roomInput.disabled = false;
  driveStopButton.disabled = true;
   updateAllDisconnectButtonAvailability();

  headerBadgeDot.classList.remove(
    "connected"
  );

  headerBadgeDot.classList.remove(
    "connecting"
  );
}


function clampStopEditValue(
  value,
  minimum,
  maximum
) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}


function applyStopButtonGeometry() {

  const wrapperRect =
    videoWrapper.getBoundingClientRect();

  if (
    wrapperRect.width <= 0 ||
    wrapperRect.height <= 0
  ) {
    return;
  }

  /*
    保存サイズが現在の画面より大きい場合だけ，
    画面内へ収まるサイズに補正する
  */
  const widthPx =
    clampStopEditValue(
      stopButtonGeometry.widthPx,
      Math.min(78, wrapperRect.width),
      wrapperRect.width
    );

  const heightPx =
    clampStopEditValue(
      stopButtonGeometry.heightPx,
      Math.min(44, wrapperRect.height),
      wrapperRect.height
    );

  /*
    ボタン左上が移動できる最大距離
  */
  const movableWidth =
    Math.max(
      0,
      wrapperRect.width - widthPx
    );

  const movableHeight =
    Math.max(
      0,
      wrapperRect.height - heightPx
    );

  const leftPx =
    movableWidth *
    clampStopEditValue(
      stopButtonGeometry.xRatio,
      0,
      1
    );

  const topPx =
    movableHeight *
    clampStopEditValue(
      stopButtonGeometry.yRatio,
      0,
      1
    );

  /*
  通常画面・全画面の両方へ，
  同じ位置とpxサイズをCSS変数として反映する
*/
videoWrapper.style.setProperty(
  "--stop-button-left",
  `${leftPx}px`
);

videoWrapper.style.setProperty(
  "--stop-button-top",
  `${topPx}px`
);

videoWrapper.style.setProperty(
  "--stop-button-width",
  `${widthPx}px`
);

videoWrapper.style.setProperty(
  "--stop-button-height",
  `${heightPx}px`
);

/*
  以前の直接指定が残っている場合に備えて解除する
*/
driveStopButton.style.removeProperty("left");
driveStopButton.style.removeProperty("top");
driveStopButton.style.removeProperty("width");
driveStopButton.style.removeProperty("height");
}


function scheduleStopButtonGeometryApply() {

  /*
    直後のレイアウト更新後に再配置する
  */
  requestAnimationFrame(
    () => {
      requestAnimationFrame(
        applyStopButtonGeometry
      );
    }
  );

  /*
    iPhoneでは縦横回転後の画面サイズ確定が遅れるため，
    時間をずらして複数回再配置する
  */
  [
    100,
    300,
    600,
    1000
  ].forEach(
    delay => {
      setTimeout(
        applyStopButtonGeometry,
        delay
      );
    }
  );
}


function saveStopButtonGeometry() {

  localStorage.setItem(
    STOP_GEOMETRY_STORAGE_KEY,
    JSON.stringify(stopButtonGeometry)
  );
}


function loadStopButtonGeometry() {

  const saved =
    localStorage.getItem(
      STOP_GEOMETRY_STORAGE_KEY
    );

  if (saved) {

    try {

      const parsed =
        JSON.parse(saved);

      if (
        Number.isFinite(parsed.xRatio) &&
        Number.isFinite(parsed.yRatio) &&
        Number.isFinite(parsed.widthPx) &&
        Number.isFinite(parsed.heightPx)
      ) {
        stopButtonGeometry = {
          xRatio:
            clampStopEditValue(
              parsed.xRatio,
              0,
              1
            ),

          yRatio:
            clampStopEditValue(
              parsed.yRatio,
              0,
              1
            ),

          widthPx:
            Math.max(
              78,
              parsed.widthPx
            ),

          heightPx:
            Math.max(
              44,
              parsed.heightPx
            )
        };
      }

    } catch (error) {

      console.error(
        "STOPボタン設定の読み込みに失敗しました。",
        error
      );
    }
  }

  scheduleStopButtonGeometryApply();
}


function startStopButtonEditor() {

  if (stopEditorActive) {
    return;
  }

  stopEditorActive = true;

  videoWrapper.classList.add(
    "stopButtonEditing"
  );

  /*
    映像を現在のフレームで停止する。
    WebRTCの接続自体や映像トラックは切断しない。
  */
  videoWasPlayingBeforeStopEdit =
    !videoElement.paused;

  if (
    videoElement.srcObject &&
    !videoElement.classList.contains("hidden")
  ) {
    videoElement.pause();
  }

  /*
    編集中はSTOPボタンを
    ドラッグ・サイズ変更可能にする
  */
  updateDriveStopButtonAvailability();

  driveStatusElement.textContent =
    "STOPボタン編集中です。ドラッグで移動し，右下の矢印で大きさを変更できます。";
}


async function finishStopButtonEditor() {

  if (!stopEditorActive) {
    return;
  }

  stopEditorActive = false;
  stopEditAction = null;

  videoWrapper.classList.remove(
    "stopButtonEditing"
  );

  saveStopButtonGeometry();

  /*
    編集前に再生中だった場合は映像を再開
  */
  if (
    videoWasPlayingBeforeStopEdit &&
    videoElement.srcObject
  ) {
    try {

      await videoElement.play();

    } catch (error) {

      console.error(
        "映像を再開できませんでした。",
        error
      );
    }
  }

  updateDriveStopButtonAvailability();

  driveStatusElement.textContent =
    "STOPボタンの位置と大きさを保存しました。";
}


function finishStopEditPointerAction() {

  if (!stopEditAction) {
    return;
  }

  stopEditAction = null;
  saveStopButtonGeometry();
}


function isMobileFullscreenLayout() {

  return (
    mobileFullscreenMedia.matches ||
    mobileCoarsePointerMedia.matches ||
    navigator.maxTouchPoints > 0
  );
}


function hideFullscreenHoldIndicator() {
  fullscreenHoldIndicator.style.display = "none";
  fullscreenHoldIndicator.classList.remove(
    "fullscreenHoldProgress",
    "fullscreenHoldCompleted"
  );
  fullscreenHoldIndicator.style.opacity = "1";
  fullscreenHoldIndicator.style.filter = "";
}


function cancelMobileFullscreenHold() {
  if (mobileFullscreenColorTimer) {
    clearTimeout(mobileFullscreenColorTimer);
    mobileFullscreenColorTimer = null;
  }

  if (mobileFullscreenHoldTimer) {
    clearTimeout(mobileFullscreenHoldTimer);
    mobileFullscreenHoldTimer = null;
  }

  mobileFullscreenHoldPointerId = null;
  mobileFullscreenHoldTriggered = false;
  hideFullscreenHoldIndicator();
}


function startMobileFullscreenHold(event) {
  if (
    !isMobileFullscreenLayout() ||
    role === null
  ) {
    return;
  }

  const rect =
    videoWrapper.getBoundingClientRect();

  const pointerX =
    event.clientX - rect.left;

  const pointerY =
    event.clientY - rect.top;

  const insideFullscreenHoldZone =
    pointerX >=
      rect.width - MOBILE_FULLSCREEN_ZONE_SIZE_PX &&
    pointerY >=
      rect.height - MOBILE_FULLSCREEN_ZONE_SIZE_PX;

  if (!insideFullscreenHoldZone) {
    return;
  }

  cancelMobileFullscreenHold();

  mobileFullscreenHoldPointerId =
    event.pointerId;

  mobileFullscreenHoldStartX =
    event.clientX;

  mobileFullscreenHoldStartY =
    event.clientY;

  fullscreenHoldIndicator.style.left =
    pointerX + "px";

  fullscreenHoldIndicator.style.top =
    pointerY + "px";

  fullscreenHoldIndicator.style.display =
    "flex";

  mobileFullscreenColorTimer = setTimeout(
    () => {
      mobileFullscreenColorTimer = null;

      if (
        mobileFullscreenHoldPointerId !==
          event.pointerId
      ) {
        return;
      }

      fullscreenHoldIndicator.classList.add(
        "fullscreenHoldProgress"
      );
    },
    MOBILE_FULLSCREEN_COLOR_DELAY_MS
  );

  mobileFullscreenHoldTimer = setTimeout(
    () => {
      mobileFullscreenHoldTimer = null;

      if (
        mobileFullscreenHoldPointerId !==
          event.pointerId
      ) {
        return;
      }

      mobileFullscreenHoldTriggered = true;

      fullscreenHoldIndicator.classList.add(
        "fullscreenHoldCompleted"
      );

      setTimeout(
        () => {
          hideFullscreenHoldIndicator();
          showMobileFullscreenButton();
        },
        180
      );
    },
    MOBILE_FULLSCREEN_HOLD_MS
  );
}


function finishMobileFullscreenHold(event) {
  if (
    mobileFullscreenHoldPointerId !==
      event.pointerId
  ) {
    return;
  }

  if (!mobileFullscreenHoldTriggered) {
    cancelMobileFullscreenHold();
    return;
  }

  mobileFullscreenHoldPointerId = null;
}


function isMobilePseudoFullscreen() {
  return videoWrapper.classList.contains(
    "mobilePseudoFullscreen"
  );
}


function updateFullscreenIcon(isFullscreen) {

  if (isFullscreen) {

    pcFullscreenButton.title =
      "全画面表示を終了";

    pcFullscreenButton.setAttribute(
      "aria-label",
      "全画面表示を終了"
    );

    pcFullscreenIcon.innerHTML = `
      <path
        d="
          M9 4V9H4
          M20 9H15V4
          M15 20V15H20
          M4 15H9V20
        "
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>
    `;

  } else {

    pcFullscreenButton.title =
      "全画面表示";

    pcFullscreenButton.setAttribute(
      "aria-label",
      "映像を全画面表示"
    );

    pcFullscreenIcon.innerHTML = `
      <path
        d="
          M4 9V4H9
          M15 4H20V9
          M20 15V20H15
          M9 20H4V15
        "
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>
    `;
  }
}


function hideMobileFullscreenButton() {

  if (mobileFullscreenHideTimer) {
    clearTimeout(mobileFullscreenHideTimer);
    mobileFullscreenHideTimer = null;
  }

  pcFullscreenButton.classList.remove(
    "mobileFullscreenVisible"
  );
}


function showMobileFullscreenButton() {

  if (!isMobileFullscreenLayout()) {
    return;
  }

  /*
    表示直後は，連続タップがそのまま
    全画面ボタンに当たらないようロックする
  */

  mobileFullscreenButtonLocked = true;

  pcFullscreenButton.classList.add(
    "mobileFullscreenVisible"
  );

  pcFullscreenButton.setAttribute(
    "aria-disabled",
    "true"
  );

  if (mobileFullscreenLockTimer) {
    clearTimeout(mobileFullscreenLockTimer);
  }

  mobileFullscreenLockTimer = setTimeout(
    () => {

      mobileFullscreenButtonLocked = false;

      pcFullscreenButton.removeAttribute(
        "aria-disabled"
      );

      mobileFullscreenLockTimer = null;
    },
    MOBILE_FULLSCREEN_LOCK_MS
  );

  /*
    数秒後に全画面アイコンを隠す
  */

  if (mobileFullscreenHideTimer) {
    clearTimeout(mobileFullscreenHideTimer);
  }

  mobileFullscreenHideTimer = setTimeout(
    hideMobileFullscreenButton,
    MOBILE_FULLSCREEN_VISIBLE_MS
  );
}


function preserveStopButtonSize() {
  saveStopButtonGeometry();
}


function restoreStopButtonSize() {
  scheduleStopButtonGeometryApply();
}


function updateMobilePseudoFullscreenViewport() {

  /*
    visualViewportが使える場合は，
    ブラウザ内で現在実際に見えている範囲を使う
  */

  if (window.visualViewport) {

    const viewport = window.visualViewport;

    videoWrapper.style.setProperty(
      "--mobile-viewport-left",
      `${viewport.offsetLeft}px`
    );

    videoWrapper.style.setProperty(
      "--mobile-viewport-top",
      `${viewport.offsetTop}px`
    );

    videoWrapper.style.setProperty(
      "--mobile-viewport-width",
      `${viewport.width}px`
    );

    videoWrapper.style.setProperty(
      "--mobile-viewport-height",
      `${viewport.height}px`
    );

    return;
  }

  /*
    visualViewportがないブラウザ用
  */

  videoWrapper.style.setProperty(
    "--mobile-viewport-left",
    "0px"
  );

  videoWrapper.style.setProperty(
    "--mobile-viewport-top",
    "0px"
  );

  videoWrapper.style.setProperty(
    "--mobile-viewport-width",
    `${window.innerWidth}px`
  );

  videoWrapper.style.setProperty(
    "--mobile-viewport-height",
    `${window.innerHeight}px`
  );
}


function enterMobilePseudoFullscreen() {

  preserveStopButtonSize();

  /*
    疑似全画面にする前に，
    現在見えている画面サイズを取得する
  */

  updateMobilePseudoFullscreenViewport();

  videoWrapper.classList.add(
    "mobilePseudoFullscreen"
  );

  document.body.classList.add(
    "mobilePseudoFullscreenActive"
  );

  updateFullscreenIcon(true);

  /*
    Chromeでは疑似全画面へ切り替えた直後に
    表示領域が変化することがあるため再取得する
  */

  requestAnimationFrame(
    updateMobilePseudoFullscreenViewport
  );

  setTimeout(
    updateMobilePseudoFullscreenViewport,
    150
  );

  setTimeout(
    updateMobilePseudoFullscreenViewport,
    400
  );
}


function exitMobilePseudoFullscreen() {

  videoWrapper.classList.remove(
    "mobilePseudoFullscreen"
  );

  document.body.classList.remove(
    "mobilePseudoFullscreenActive"
  );

  /*
    疑似全画面用に設定した画面サイズを解除する
  */

  videoWrapper.style.removeProperty(
    "--mobile-viewport-left"
  );

  videoWrapper.style.removeProperty(
    "--mobile-viewport-top"
  );

  videoWrapper.style.removeProperty(
    "--mobile-viewport-width"
  );

  videoWrapper.style.removeProperty(
    "--mobile-viewport-height"
  );

  restoreStopButtonSize();
  updateFullscreenIcon(false);
}


async function togglePcFullscreen() {

  try {

    /*
      iPhone用の疑似全画面から戻す
    */

    if (isMobilePseudoFullscreen()) {
      exitMobilePseudoFullscreen();
      hideMobileFullscreenButton();
      return;
    }

    /*
      本当の全画面表示中なら戻す
    */

    if (
      document.fullscreenElement ===
      videoWrapper
    ) {
      await document.exitFullscreen();
      hideMobileFullscreenButton();
      return;
    }

    /*
      別の要素が全画面なら終了する
    */

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }

    /*
      全画面になる直前の
      STOPボタンの大きさを保存
    */

    preserveStopButtonSize();

  /*
  iPhoneなどのタッチ端末では，
  画面回転でも解除されにくい
  疑似全画面を直接使用する
*/

if (isMobileFullscreenLayout()) {

  enterMobilePseudoFullscreen();

  hideMobileFullscreenButton();

  return;
}

    /*
      PCでは本当の全画面表示
    */

    await videoWrapper.requestFullscreen();

  } catch (error) {

    restoreStopButtonSize();

    console.error(
      "全画面表示の切り替えに失敗しました。",
      error
    );

    setStatus(
      "全画面表示に切り替えられませんでした。"
    );
  }
}


function refreshMobileFullscreenAfterRotation() {

  /*
    iPhoneでは縦横回転後に画面サイズが
    数段階に分かれて更新されるため，
    時間をずらして何度か整える
  */
  [
    100,
    350,
    700
  ].forEach(
    delay => {

      setTimeout(
        () => {

          /*
            長押し途中の処理を中止する
          */
          cancelMobileFullscreenHold();

          mobileFullscreenHoldTriggered =
            false;

          /*
            全画面ボタンの一時ロックを解除する
          */
          mobileFullscreenButtonLocked =
            false;

          if (mobileFullscreenLockTimer) {

            clearTimeout(
              mobileFullscreenLockTimer
            );

            mobileFullscreenLockTimer =
              null;
          }

          pcFullscreenButton.removeAttribute(
            "aria-disabled"
          );

          /*
            疑似全画面中なら，
            回転後の実際の表示領域へ合わせ直す
          */
          if (isMobilePseudoFullscreen()) {

            videoWrapper.classList.add(
              "mobilePseudoFullscreen"
            );

            document.body.classList.add(
              "mobilePseudoFullscreenActive"
            );

            updateMobilePseudoFullscreenViewport();

            updateFullscreenIcon(true);

            hideMobileFullscreenButton();

          } else {

            /*
              通常表示中は全画面アイコンを隠す
            */
            updateFullscreenIcon(false);

            hideMobileFullscreenButton();
          }

          /*
            回転後の新しい映像枠サイズを使って，
            STOPボタンを画面内へ再配置する
          */
          scheduleStopButtonGeometryApply();
        },
        delay
      );
    }
  );
}


function applyStopButtonVisibility() {

  const shouldShow =
    stopButtonVisibleToggle.checked;

  driveStopButton.classList.toggle(
    "stopButtonHidden",
    !shouldShow
  );

  stopVisibilityState.textContent =
    shouldShow ? "表示" : "非表示";
}


function loadSettings() {

  const savedPcKey =
    localStorage.getItem("pcStopKey");

  if (savedPcKey !== null) {
    pcStopKey.value = savedPcKey;
  }

  const savedStopButtonVisible =
    localStorage.getItem(
      "stopButtonVisible"
    );

  /*
    保存値がない最初の起動では表示する。
    "false"と保存されている場合だけ非表示。
  */
  stopButtonVisibleToggle.checked =
    savedStopButtonVisible !== "false";

  applyStopButtonVisibility();
}


function saveSettings() {

  localStorage.setItem(
    "pcStopKey",
    pcStopKey.value
  );

  localStorage.setItem(
    "stopButtonVisible",
    String(stopButtonVisibleToggle.checked)
  );
}
