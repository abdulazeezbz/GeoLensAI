"use client";

import Webcam from "react-webcam";
import { useRef, useEffect, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs";

const ColorThief: any = require("color-thief-browser");



export default function Camera() {

  
  const webcamRef = useRef<Webcam>(null);
  const [description, setDescription] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);

  // Load COCO-SSD
  useEffect(() => {
    cocoSsd.load().then((m) => setModel(m));
  }, []);

  // Detect objects every 2.5s
  useEffect(() => {
    if (!isReady || !model) return;

    const interval = setInterval(async () => {
      try {
        if (!webcamRef.current || isSpeaking) return;
        const video = webcamRef.current.video;
        if (!video) return;

        const predictions = await model.detect(video);
        if (predictions.length === 0) return;

        const objects: string[] = [];
        const colorThief = new ColorThief();

        // Track number of people
        let personCount = 0;

        for (const p of predictions) {
          if (p.class === "person") {
            personCount++;

            // Crop person bounding box to detect color
            const canvas = document.createElement("canvas");
            canvas.width = p.bbox[2];
            canvas.height = p.bbox[3];
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.drawImage(
              video,
              p.bbox[0],
              p.bbox[1],
              p.bbox[2],
              p.bbox[3],
              0,
              0,
              p.bbox[2],
              p.bbox[3]
            );

            const img = new Image();
            img.src = canvas.toDataURL();
            await new Promise((res) => (img.onload = res));

            const [r, g, b] = colorThief.getColor(img);
            const colorName = rgbToColorName(r, g, b);

            objects.push(`person ${personCount} wearing ${colorName}`);
          } else {
            objects.push(p.class);
          }
        }

        const message = `Describe surroundings for a blind person: ${objects.join(
          ", "
        )}. Keep it under 2 sentences.`;

        // Send to Groq
        const res = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const data = await res.json();
        if (data.text) {
          setDescription(data.text); // Replace previous text
          speak(data.text);
        }
      } catch (err) {
        console.error("Camera loop error:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isReady, isSpeaking, model]);

  function speak(text: string) {
    if (!window.speechSynthesis) return;
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
    <div className="flex flex-col items-center gap-4">
      <Webcam
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={{ facingMode: "environment" }}
        onUserMedia={() => setIsReady(true)}
        className="rounded-lg"
      />
      <p className="text-center text-lg font-medium text-green-600" key={description}>
        {description || "Scanning surroundings..."}
      </p>
    </div>
  );
}

// Simple RGB to color name
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
