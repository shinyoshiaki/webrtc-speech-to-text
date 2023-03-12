import speech from "@google-cloud/speech";
import credentials from "./credential.json";
import { spawn } from "child_process";
import { createSocket } from "dgram";
import { mkdir, readFile, rm } from "fs/promises";

import {
  DepacketizeCallback,
  randomPort,
  RtpPacket,
  RtpSourceCallback,
  RtpTimeCallback,
  saveToFileSystem,
  WebmCallback,
} from "werift";

const input = "./i.mp3";
const tmp = "./tmp";

console.log("start");

const client = new speech.SpeechClient({ credentials });

async function main() {
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  await mkdir(tmp, { recursive: true });
  const port = await randomPort();

  const stream = client.streamingRecognize({
    config: {
      encoding: "WEBM_OPUS",
      sampleRateHertz: 48000,
      languageCode: "ja-JP",
    },
    interimResults: true,
  });

  stream.on("data", (res) => {
    for (const result of res.results) {
      for (const alt of result.alternatives) {
        console.log(alt.transcript);
      }
    }
  });
  stream.on("error", (e) => {
    console.error("error", e);
  });

  const args = [
    `filesrc location=${input} ! decodebin ! audioconvert ! audioresample ! audio/x-raw, rate=8000 ! opusenc`,
    `rtpopuspay pt=97`,
    `udpsink host=127.0.0.1 port=${port}`,
  ].join(" ! ");
  spawn("gst-launch-1.0", args.split(" "));

  const udp = createSocket("udp4");
  udp.bind(port);
  udp.on("message", (data) => {
    const rtp = RtpPacket.deSerialize(data);
    source.input(rtp);
  });

  let webm: WebmCallback;
  const createWebm = () => {
    return new WebmCallback(
      [
        {
          kind: "audio",
          codec: "OPUS",
          clockRate: 48000,
          trackNumber: 1,
        },
      ],
      { duration: 1000 * 60 * 60 * 24 }
    );
  };
  webm = createWebm();

  const source = new RtpSourceCallback();
  const time = new RtpTimeCallback(48000);
  const depacketizer = new DepacketizeCallback("opus");

  source.pipe((input) => time.input(input));
  time.pipe((input) => depacketizer.input(input));
  depacketizer.pipe(webm.inputAudio);
  let index = 0;
  const filename = () => tmp + "/" + index + ".webm";
  webm.pipe(saveToFileSystem(filename()));

  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));

    const prev = filename();

    webm.inputAudio({ eol: true });
    webm = createWebm();
    depacketizer.pipe(webm.inputAudio);
    index++;
    webm.pipe(saveToFileSystem(filename()));

    const file = await readFile(prev);
    stream.write(file);
    console.log("write");
  }
}

main();
