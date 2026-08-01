"use strict";

function updateBleConnectionDisplay(
  connected,
  message = null
) {
  if (connected) {
    bleConnectionStatus.textContent =
      message || "接続済み";

    bleStatusDot.classList.add(
      "connected"
    );

    bleConnectButton.textContent =
      "BLE切断";

    bleConnectButton.classList.add(
      "bleDisconnectMode"
    );

    bleConnectButton.disabled = false;

  } else {
    bleConnectionStatus.textContent =
      message || "未接続";

    bleStatusDot.classList.remove(
      "connected"
    );

    bleConnectButton.textContent =
      "BLE接続";

    bleConnectButton.classList.remove(
      "bleDisconnectMode"
    );

    bleConnectButton.disabled = false;
  }

  updateAllDisconnectButtonAvailability();
}


function updateAllDisconnectButtonAvailability() {

  const webRtcActive =
    role !== null;

  const bleActive =
    bleDevice &&
    bleDevice.gatt &&
    bleDevice.gatt.connected;

  stopButton.disabled =
    !webRtcActive &&
    !bleActive;
}


function handleBleDisconnected() {
  console.log("BLE接続が切断されました。");

  bleServer = null;
  bleCharacteristic = null;
  bleConnecting = false;

  updateBleConnectionDisplay(
    false,
    "未接続"
  );

  driveStatusElement.textContent =
    "機器とのBLE接続が切断されました。";
}


async function connectBleDevice() {

  if (bleConnecting) {
    return;
  }

  if (
    bleDevice &&
    bleDevice.gatt &&
    bleDevice.gatt.connected
  ) {
    updateBleConnectionDisplay(
      true,
      "接続済み"
    );

    return;
  }

  if (!navigator.bluetooth) {
    setStatus(
      "このブラウザはWeb Bluetoothに対応していません。"
    );

    driveStatusElement.textContent =
      "Bluefyなど，Web Bluetooth対応ブラウザで開いてください。";

    return;
  }

  try {
    bleConnecting = true;

    bleConnectButton.disabled = true;
    bleConnectButton.textContent =
      "接続中…";

    bleConnectionStatus.textContent =
      "接続中";

    /*
      AtomS3-RCを選択する画面を表示
    */
    bleDevice =
      await navigator.bluetooth.requestDevice({
        filters: [
          {
            name: BLE_DEVICE_NAME
          }
        ],

        optionalServices: [
          BLE_SERVICE_UUID
        ]
      });

    bleDevice.addEventListener(
      "gattserverdisconnected",
      handleBleDisconnected
    );

    /*
      AtomS3 Liteへ接続
    */
    bleServer =
      await bleDevice.gatt.connect();

    /*
      操縦用サービスを取得
    */
    const bleService =
      await bleServer.getPrimaryService(
        BLE_SERVICE_UUID
      );

    /*
      操縦命令を書き込むCharacteristicを取得
    */
    bleCharacteristic =
      await bleService.getCharacteristic(
        BLE_CHARACTERISTIC_UUID
      );

    updateBleConnectionDisplay(
      true,
      "接続済み"
    );

    driveStatusElement.textContent =
      "機器とのBLE接続が完了しました。";

    setStatus(
      "AtomS3 LiteへBLE接続しました。"
    );

  } catch (error) {
    console.error(
      "BLE接続エラー",
      error
    );

    bleServer = null;
    bleCharacteristic = null;

    updateBleConnectionDisplay(
      false,
      "未接続"
    );

    /*
      機器選択画面でキャンセルした場合
    */
    if (
      error &&
      error.name === "NotFoundError"
    ) {
      driveStatusElement.textContent =
        "BLE接続をキャンセルしました。";

      return;
    }

    driveStatusElement.textContent =
      "機器とのBLE接続に失敗しました。";

    setStatus(
      "BLE接続に失敗しました。\n" +
      (error.message || "原因不明のエラー")
    );

  } finally {
    bleConnecting = false;

    if (
      !bleDevice ||
      !bleDevice.gatt ||
      !bleDevice.gatt.connected
    ) {
      bleConnectButton.disabled = false;
      bleConnectButton.textContent =
        "BLE接続";
    }
  }
}


function disconnectBleDevice() {

  if (
    bleDevice &&
    bleDevice.gatt &&
    bleDevice.gatt.connected
  ) {
    bleDevice.gatt.disconnect();
  }

  bleServer = null;
  bleCharacteristic = null;
  bleConnecting = false;

  updateBleConnectionDisplay(
    false,
    "未接続"
  );
}


function toggleBleConnection() {

  const bleConnected =
    bleDevice &&
    bleDevice.gatt &&
    bleDevice.gatt.connected;

  if (bleConnected) {

    disconnectBleDevice();

    driveStatusElement.textContent =
      "機器とのBLE接続を終了しました。";

    setStatus(
      "AtomS3 LiteとのBLE接続を終了しました。"
    );

    return;
  }

  connectBleDevice();
}


function cancelRemoteStopResend() {
  if (remoteStopResendTimer1 !== null) {
    clearTimeout(remoteStopResendTimer1);
    remoteStopResendTimer1 = null;
  }

  if (remoteStopResendTimer2 !== null) {
    clearTimeout(remoteStopResendTimer2);
    remoteStopResendTimer2 = null;
  }
}


function sendStopToBleWithRetry() {
  cancelRemoteStopResend();

  console.warn(
    "★★ BLE停止座標を送信1回目 X:128 Y:128 ★★"
  );

  sendCoordinatesToBle(0, 0);

  remoteStopResendTimer1 = setTimeout(() => {
    remoteStopResendTimer1 = null;

    console.warn(
      "★★ BLE停止座標を送信2回目 X:128 Y:128 ★★"
    );

    sendCoordinatesToBle(0, 0);
  }, 100);

  remoteStopResendTimer2 = setTimeout(() => {
    remoteStopResendTimer2 = null;

    console.warn(
      "★★ BLE停止座標を送信3回目 X:128 Y:128 ★★"
    );

    sendCoordinatesToBle(0, 0);
  }, 250);
}


async function processBleCoordinateQueue() {
  if (bleCoordinateWriteInProgress) {
    return;
  }

  bleCoordinateWriteInProgress = true;

  try {
    while (pendingBleCoordinates && bleCharacteristic) {
      const data = pendingBleCoordinates;
      pendingBleCoordinates = null;

      if (
        typeof bleCharacteristic.writeValueWithoutResponse ===
        "function"
      ) {
        await bleCharacteristic.writeValueWithoutResponse(data);
      } else {
        await bleCharacteristic.writeValue(data);
      }

      console.log(
        "BLE送信 X:", data[0],
        "Y:", data[1]
      );
    }
  } catch (error) {
    console.error("BLE操縦データ送信エラー", error);
  } finally {
    bleCoordinateWriteInProgress = false;

    if (pendingBleCoordinates && bleCharacteristic) {
      processBleCoordinateQueue();
    }
  }
}
