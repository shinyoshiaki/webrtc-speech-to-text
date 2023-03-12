import { FC } from "react";
import ReactDOM from "react-dom";

const App: FC = () => {
  const start = async () => {
    const socket = new WebSocket("ws://localhost:8888");
    await new Promise((r) => (socket.onopen = r));
    console.log("open websocket");

    const offer = await new Promise<any>(
      (r) => (socket.onmessage = (ev) => r(JSON.parse(ev.data)))
    );
    console.log("offer", offer.sdp);

    const pc = new RTCPeerConnection({
      iceServers: [],
    });
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) {
        const sdp = JSON.stringify(pc.localDescription);
        socket.send(sdp);
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
  };

  return (
    <div>
      <button onClick={start}>start</button>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
