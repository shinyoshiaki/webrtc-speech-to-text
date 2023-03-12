import speech from "@google-cloud/speech";
import credentials from "./credential.json";
import { Server } from "ws";
import { mkdir, readFile, rm } from "fs/promises";

import {
  DepacketizeCallback,
  RTCPeerConnection,
  RtpSourceCallback,
  RtpTimeCallback,
  saveToFileSystem,
  WebmCallback,
} from "werift";

const tmp = "./tmp";

console.log("start");

const server = new Server({ port: 8888 });
const client = new speech.SpeechClient({ credentials });

async function main() {
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  await mkdir(tmp, { recursive: true });

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

  server.on("connection", async (socket) => {
    const pc = new RTCPeerConnection({});

    pc.addTransceiver("audio", { direction: "recvonly" }).onTrack.subscribe(
      async (track) => {
        console.log("onTrack");
        track.onReceiveRtp.subscribe((rtp) => {
          source.input(rtp);
        });

        for (;;) {
          await new Promise((r) => setTimeout(r, 3000));

          const prev = filename();

          webm.inputAudio({ eol: true });
          webm = createWebm();
          depacketizer.pipe(webm.inputAudio);
          index++;
          webm.pipe(saveToFileSystem(filename()));

          const file = await readFile(prev);
          stream.write(file);
        }
      }
    );

    await pc.setLocalDescription(await pc.createOffer());
    const sdp = JSON.stringify(pc.localDescription);
    socket.send(sdp);

    socket.on("message", (data: any) => {
      pc.setRemoteDescription(JSON.parse(data));
    });
  });
}

main();
