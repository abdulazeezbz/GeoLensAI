"use client";

import Webcam from "react-webcam";
import { useRef, useEffect, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as blazeface from "@tensorflow-models/blazeface";
import * as faceapi from "face-api.js";
import "@tensorflow/tfjs";
// @ts-ignore
import ColorThief from "color-thief-browser";

export default function Camera() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [objectModel, setObjectModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [faceModel, setFaceModel] = useState<blazeface.BlazeFaceModel | null>(null);
  const [description, setDescription] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Load models
  useEffect(() => {
    cocoSsd.load().then(setObjectModel);
    blazeface.load().then(setFaceModel);

    const loadFaceApiModels = async () => {
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      await faceapi.nets.faceExpressionNet.loadFromUri("/models");
    };
    loadFaceApiModels();
  }, []);

  // Main loop
  useEffect(() => {
    if (!isReady || !objectModel || !faceModel) return;

    const interval = setInterval(async () => {
      try {
        if (!webcamRef.current || !canvasRef.current || isSpeaking) return;

        const video = webcamRef.current.video;
        const canvas = canvasRef.current;
        if (!video) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "green";
        ctx.lineWidth = 2;
        ctx.font = "16px Arial";
        ctx.fillStyle = "green";

        // Detect objects
        const predictions = await objectModel.detect(video);
        const detectedObjects: string[] = [];
        const colorThief = new ColorThief();
        const persons: string[] = [];

        predictions.forEach((p) => {
          const [x, y, w, h] = p.bbox;
          ctx.strokeRect(x, y, w, h);
          ctx.fillText(p.class, x, y > 10 ? y - 5 : y + 15);

          if (p.class === "person") {
            const tmpCanvas = document.createElement("canvas");
            tmpCanvas.width = w;
            tmpCanvas.height = h;
            const tmpCtx = tmpCanvas.getContext("2d");
            if (tmpCtx) {
              tmpCtx.drawImage(video, x, y, w, h, 0, 0, w, h);
              const img = new Image();
              img.src = tmpCanvas.toDataURL();
              img.onload = () => {
                try {
                  const [r, g, b] = colorThief.getColor(img);
                  const colorName = rgbToColorName(r, g, b);
                  persons.push(`person wearing ${colorName}`);
                } catch {}
              };
            }
          } else {
            detectedObjects.push(p.class);
          }
        });

        // Detect faces + expressions
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();

        const faceCount = detections.length;
        const expressionDescriptions: string[] = [];

        detections.forEach((detection) => {
          const box = detection.detection.box;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          const dominantExpression = Object.entries(detection.expressions)
            .sort((a, b) => b[1] - a[1])[0][0];
          expressionDescriptions.push(dominantExpression);
          ctx.fillText(dominantExpression, box.x, box.y > 10 ? box.y - 5 : box.y + 15);
        });

        // People summary
        let peopleDesc = "";
        if (faceCount === 1)
          peopleDesc = `1 person${expressionDescriptions[0] ? ` ${expressionDescriptions[0]}` : ""}`;
        else if (faceCount > 3) peopleDesc = `a group of people`;
        else if (faceCount > 1) peopleDesc = `${faceCount} people`;

        // Combine objects, persons, and expressions
        const allObjects = [...detectedObjects, ...persons];

        const message = `Describe surroundings for a blind person: ${allObjects.join(
          ", "
        )}. ${peopleDesc ? peopleDesc + "." : ""} Keep it under 2 sentences.`;

        // Send to Groq
        const res = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const data = await res.json();
        if (data.text) {
          setDescription(""); // remove previous description
          setTimeout(() => setDescription(data.text), 100); // set new description
          speak(data.text);
        }
      } catch (err) {
        console.error("Camera loop error:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isReady, objectModel, faceModel, isSpeaking]);

  // Browser-safe speech synthesis
  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;

    const voices = speechSynthesis.getVoices();
    const femaleVoice = voices.find((v) => /female|zira|susan|sallie/i.test(v.name));
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.lang = "en-US";
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);

    speechSynthesis.speak(utterance);
  }

  return (
    <div className="relative w-full max-w-3xl">
      <Webcam
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={{ facingMode: "environment" }}
        onUserMedia={() => setIsReady(true)}
        className="rounded-lg w-full"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />
      <p className="text-center text-lg font-medium text-green-600 mt-2">
        {description || "Scanning surroundings..."}
      </p>
    </div>
  );
}

// RGB to color name helper
function rgbToColorName(r: number, g: number, b: number) {
  const colors: Record<string, [number, number, number]> = {
    red: [255, 0, 0],
    blue: [0, 0, 255],
    green: [0, 128, 0],
    yellow: [255, 255, 0],
    black: [0, 0, 0],
    white: [255, 255, 255],
    gray: [128, 128, 128],
    orange: [255, 165, 0],
    pink: [255, 192, 203],
    purple: [128, 0, 128],
    brown: [165, 42, 42],
  };
  let closest = "unknown";
  let minDistance = Infinity;
  for (const [name, [cr, cg, cb]] of Object.entries(colors)) {
    const distance = Math.sqrt((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2);
    if (distance < minDistance) {
      minDistance = distance;
      closest = name;
    }
  }
  return closest;
}
