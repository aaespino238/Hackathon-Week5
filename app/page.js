"use client";  // Marks this component as a Client Component

import { useState, useEffect } from "react";
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import * as THREE from 'three';
import chroma from 'chroma-js';

export default function Home() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoSrc, setVideoSrc] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    function App() {
      const conf = {
        nx: 40,
        ny: 100,
        cscale: chroma.scale(['#FFC0CB', '#FF69B4', '#FF1493', '#DB7093', '#C71585']).mode('lch'), // Pink Theme
        darken: -2.0,
        angle: Math.PI / 3,
        timeCoef: 0.1
      };

      let renderer, scene, camera;
      let width, height;
      const { randFloat: rnd } = THREE.MathUtils;

      const uTime = { value: 0 }, uTimeCoef = { value: conf.timeCoef };
      const polylines = [];

      init();

      function init() {
        renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
        camera = new THREE.PerspectiveCamera();

        updateSize();
        window.addEventListener('resize', updateSize, false);

        initScene();
        requestAnimationFrame(animate);
      }

      function initScene() {
        scene = new THREE.Scene();
        const vertexShader = `
          uniform float uTime, uTimeCoef;
          uniform float uSize;
          uniform mat2 uMat2;
          uniform vec3 uRnd1;
          uniform vec3 uRnd2;
          uniform vec3 uRnd3;
          uniform vec3 uRnd4;
          uniform vec3 uRnd5;
          attribute vec3 next, prev; 
          attribute float side;
          varying vec2 vUv;

          vec2 dp(vec2 sv) {
            return (1.5 * sv * uMat2);
          }

          void main() {
            vUv = uv;

            vec2 pos = dp(position.xy);

            vec2 normal = dp(vec2(1, 0));
            normal *= uSize;

            float time = uTime * uTimeCoef;
            vec3 rnd1 = vec3(cos(time * uRnd1.x + uRnd3.x), cos(time * uRnd1.y + uRnd3.y), cos(time * uRnd1.z + uRnd3.z));
            vec3 rnd2 = vec3(cos(time * uRnd2.x + uRnd4.x), cos(time * uRnd2.y + uRnd4.y), cos(time * uRnd2.z + uRnd4.z));
            normal *= 1.0
              + uRnd5.x * (cos((position.y + rnd1.x) * 20.0 * rnd1.y) + 1.0)
              + uRnd5.y * (sin((position.y + rnd2.x) * 20.0 * rnd2.y) + 1.0)
              + uRnd5.z * (cos((position.y + rnd1.z) * 20.0 * rnd2.z) + 1.0);
            pos.xy -= normal * side;

            gl_Position = vec4(pos, 0.0, 1.0);
          }
        `;

        const fragmentShader = `
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          varying vec2 vUv;
          void main() {
            gl_FragColor = vec4(mix(uColor1, uColor2, vUv.x), 1.0);
          }
        `;

        const dx = 2 / (conf.nx), dy = -2 / (conf.ny - 1);
        const ox = -1 + dx / 2, oy = 1;
        const mat2 = Float32Array.from([Math.cos(conf.angle), -Math.sin(conf.angle), Math.sin(conf.angle), Math.cos(conf.angle)]);
        for (let i = 0; i < conf.nx; i++) {
          const points = [];
          for (let j = 0; j < conf.ny; j++) {
            const x = ox + i * dx, y = oy + j * dy;
            points.push(new THREE.Vector3(x, y, 0));
          }
          const polyline = new Polyline({ points });
          polylines.push(polyline);

          const material = new THREE.ShaderMaterial({
            uniforms: {
              uTime,
              uTimeCoef,
              uMat2: { value: mat2 },
              uSize: { value: 1.5 / conf.nx },
              uRnd1: { value: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)) },
              uRnd2: { value: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)) },
              uRnd3: { value: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)) },
              uRnd4: { value: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)) },
              uRnd5: { value: new THREE.Vector3(rnd(0.2, 0.5), rnd(0.3, 0.6), rnd(0.4, 0.7)) },
              uColor1: { value: new THREE.Color(conf.cscale(i / conf.nx).hex()) },
              uColor2: { value: new THREE.Color(conf.cscale(i / conf.nx).darken(conf.darken).hex()) }
            },
            vertexShader,
            fragmentShader
          });
          const mesh = new THREE.Mesh(polyline.geometry, material);
          scene.add(mesh);
        }
      }

      function animate(t) {
        uTime.value = t * 0.001;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      function updateSize() {
        width = window.innerWidth;
        height = window.innerHeight;
        renderer.setSize(width, height);
      }
    }

    // adapted from https://github.com/oframe/ogl/blob/master/src/extras/Polyline.js
    const Polyline = (function () {
      const tmp = new THREE.Vector3();

      class Polyline {
        constructor(params) {
          const { points } = params;
          this.points = points;
          this.count = points.length;
          this.init();
          this.updateGeometry();
        }

        init() {
          this.geometry = new THREE.BufferGeometry();
          this.position = new Float32Array(this.count * 3 * 2);
          this.prev = new Float32Array(this.count * 3 * 2);
          this.next = new Float32Array(this.count * 3 * 2);
          const side = new Float32Array(this.count * 1 * 2);
          const uv = new Float32Array(this.count * 2 * 2);
          const index = new Uint16Array((this.count - 1) * 3 * 2);

          for (let i = 0; i < this.count; i++) {
            const i2 = i * 2;
            side.set([-1, 1], i2);
            const v = i / (this.count - 1);
            uv.set([0, v, 1, v], i * 4);

            if (i === this.count - 1) continue;
            index.set([i2 + 0, i2 + 1, i2 + 2], (i2 + 0) * 3);
            index.set([i2 + 2, i2 + 1, i2 + 3], (i2 + 1) * 3);
          }

          this.geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
          this.geometry.setAttribute('prev', new THREE.BufferAttribute(this.prev, 3));
          this.geometry.setAttribute('next', new THREE.BufferAttribute(this.next, 3));
          this.geometry.setAttribute('side', new THREE.BufferAttribute(side, 1));
          this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
        }

        updateGeometry() {
          this.points.forEach((p, i) => {
            p.toArray(this.position, i * 3 * 2);
            p.toArray(this.position, i * 3 * 2 + 3);

            if (!i) {
              tmp.copy(p).sub(this.points[i + 1]).add(p);
              tmp.toArray(this.prev, i * 3 * 2);
              tmp.toArray(this.prev, i * 3 * 2 + 3);
            } else {
              p.toArray(this.next, (i - 1) * 3 * 2);
              p.toArray(this.next, (i - 1) * 3 * 2 + 3);
            }

            if (i === this.points.length - 1) {
              tmp.copy(p).sub(this.points[i - 1]).add(p);
              tmp.toArray(this.next, i * 3 * 2);
              tmp.toArray(this.next, i * 3 * 2 + 3);
            } else {
              p.toArray(this.prev, (i + 1) * 3 * 2);
              p.toArray(this.prev, (i + 1) * 3 * 2 + 3);
            }
          });

          this.geometry.attributes.position.needsUpdate = true;
          this.geometry.attributes.prev.needsUpdate = true;
          this.geometry.attributes.next.needsUpdate = true;
        }
      }

      return Polyline;
    })();

    App();
  }, []);

  const handleVideoUpload = async (event) => {
    var data = new FormData()
    const file = event.target.files[0];

    if (file) {
      data.append('videoFile', file)

      const response = await fetch('http://127.0.0.1:5000/api/processVideo', {
        method: 'POST',
        body: data
      })

      const processedVideoBlob = await response.blob();
      response.download

      const processedVideoFile = new File([processedVideoBlob], 'processedVideo.mp4', {
        type: 'video/mp4',
        lastModified: new Date().getTime()
      })

      setVideoFile(processedVideoFile);
      const videoURL = URL.createObjectURL(processedVideoFile);
      setVideoSrc(videoURL);

      // Placeholder: This will later be replaced with an actual API call to transcribe video
      fetchTranscript(file);
    }
  };

  // Placeholder function to simulate fetching transcript from the backend
  const fetchTranscript = async (file) => {
    // Simulate an API call delay
    setTimeout(() => {
      setTranscript([
        { time: "00:00", text: "Intro" },
        { time: "00:10", text: "Jellyfish swimming" },
        { time: "00:30", text: "End" },
      ]);
    }, 2000); // Simulated delay for API response
  };

  const handleTranscriptClick = (time) => {
    const videoElement = document.getElementById("videoPreview");
    const timeParts = time.split(":").map(Number);
    const seconds = timeParts[0] * 60 + timeParts[1];
    videoElement.currentTime = seconds;
    videoElement.play();
  };

  const handleExpandClick = () => {
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
  };

  const handleExportTranscript = () => {
    const element = document.createElement("a");
    const file = new Blob([transcript.map(t => `${t.time}: ${t.text}`).join("\n")], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = "transcript.txt";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <canvas 
        id="canvas" 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: -1,  // Puts the canvas behind all other content
        }} 
      ></canvas>

      <Box 
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: videoFile ? 'space-between' : 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '20px',
          boxSizing: 'border-box',
          textAlign: 'center',
          position: 'relative',  // Ensures this content is above the canvas
          zIndex: 1,
        }}
      >
        {!videoFile && (
          <Card 
            sx={{ 
              width: '100%', 
              maxWidth: 400, 
              height: 300,  // Makes the card taller than it is wide
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: '16px', 
              background: 'rgba(255, 255, 255, 0.5)',  // Slightly more opaque
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '20px'
            }}
          >
            <Typography variant="h4" component="h1" gutterBottom>
              NabuNote
            </Typography>
            <Button
              variant="contained"
              component="label"
              sx={{ textTransform: 'none', marginTop: '20px' }}  // Keeps the text case as is and adds margin
            >
              Upload file
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                hidden
              />
            </Button>
          </Card>
        )}

        {videoSrc && (
          <Card 
            sx={{ 
              width: '100%', 
              maxWidth: 800, 
              flexGrow: 1, 
              borderRadius: '16px', 
              background: 'rgba(255, 255, 255, 0.5)',  // Slightly more opaque
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
            }}
          >
            <CardMedia
              component="video"
              controls
              src={videoSrc}
              sx={{ height: 200, borderRadius: '16px 16px 0 0' }}  // Rounded top corners
              id="videoPreview"
            />
            <CardContent sx={{ borderRadius: '0 0 16px 16px' }}>  
              <Typography variant="h6" component="div">
                Preview Video
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This is your uploaded video. You can play it back and review it.
              </Typography>
            </CardContent>
          </Card>
        )}

        {transcript.length > 0 && (
          <Card 
            sx={{ 
              width: '100%', 
              maxWidth: 800, 
              marginTop: "20px", 
              flexGrow: 1, 
              borderRadius: '16px', 
              background: 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
            }}
          >
            <CardContent sx={{ paddingBottom: '16px !important', borderRadius: '16px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" component="div">
                  Transcript
                </Typography>
                <Box>
                  <IconButton onClick={handleExpandClick}>
                    <ExpandMoreIcon />
                  </IconButton>
                  <IconButton onClick={handleExportTranscript}>
                    <DownloadIcon />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ maxHeight: 150, overflowY: 'auto', marginTop: 2 }}>
                <List>
                  {transcript.map((item, index) => (
                    <ListItem 
                      key={index} 
                      button 
                      onClick={() => handleTranscriptClick(item.time)}
                    >
                      <ListItemText 
                        primary={item.text} 
                        secondary={item.time} 
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </CardContent>
          </Card>
        )}

        <Dialog open={isDialogOpen} onClose={handleDialogClose} maxWidth="md" fullWidth>
          <DialogTitle>Transcript</DialogTitle>
          <DialogContent dividers>
            <List>
              {transcript.map((item, index) => (
                <ListItem 
                  key={index} 
                  button 
                  onClick={() => handleTranscriptClick(item.time)}
                >
                  <ListItemText 
                    primary={item.text} 
                    secondary={item.time} 
                  />
                </ListItem>
              ))}
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDialogClose} color="primary">
              Close
            </Button>
          </DialogActions>
        </Dialog>

        {transcript.length === 0 && videoFile && (
          <Typography variant="body1" color="text.secondary">
            Transcribing video... Please wait.
          </Typography>
        )}
      </Box>
    </div>
  );
}
