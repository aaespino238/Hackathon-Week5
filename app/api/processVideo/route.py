from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from moviepy.editor import VideoFileClip, TextClip, CompositeVideoClip
from openai import OpenAI
import math
import tempfile
import os
import cv2
import re

# python app/api/processVideo/route.py

app = Flask(__name__)
# CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}}, supports_credentials=True)
CORS(app)


    
TEMP_DIR = os.path.join('app', 'temp')
tempVideoPath = os.path.join(TEMP_DIR, "oldVideo.mp4")
tempNewVideoPath = os.path.join(TEMP_DIR, "newVideo.mp4")
tempAudioPath = os.path.join(TEMP_DIR, "audio.mp3")

# Get the current directory (ProcessVideo folder)
current_dir = os.path.dirname(os.path.abspath(__file__))

# Go up two levels to reach the 'app' directory
app_dir = os.path.dirname(os.path.dirname(current_dir))

# Define the temp folder path
temp_folder = os.path.join(app_dir, 'temp')

def getCaptions(transcript, maxLength):
    text = transcript.text

    text = re.split(r'[.,]', text)

    captions = []
    for seg in text:
        seg = seg.strip()
        if seg:
            if len(seg) > maxLength:
                splitInd = len(seg)//2
                if seg[splitInd] != ' ':
                    l = r = splitInd
                    while seg[l] != ' ' and seg[r] != ' ':
                        l -= 1
                        r += 1
                    splitInd = l if seg[l] == ' ' else r
                captions.append(seg[splitInd:].strip())
                captions.append(seg[:splitInd].strip())
            else:
                captions.append(seg)
    
    return captions

def getCaptionTimestamps(captions, transcript):
    wordInd = 0
    words = transcript.words
    output = []
    for caption in captions:
        captionWords = caption.split(' ')
        output.append({
            "caption": caption,
            "start": words[wordInd]["start"],
            "end": words[wordInd + len(captionWords)-1]["end"],
            "words": words[wordInd:wordInd + len(captionWords)-1]
        })
        wordInd += len(captionWords)
    
    return output


@app.route('/api/processVideo', methods=['POST'])
def processVideo():
    global temp_files

    # check if video file is valid input
    if 'videoFile' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    videoFile = request.files['videoFile']
    if videoFile.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # initialize client
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )

    try:

        videoFile.save(tempVideoPath)
    
        # extract audio
        video = VideoFileClip(tempVideoPath)
        audio = video.audio
        audio.write_audiofile(tempAudioPath)
        audio_file = open(tempAudioPath, "rb")

        # extract transcript
        transcript = client.audio.transcriptions.create(
            model="whisper-1", 
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["word"]
        )

        wordList = transcript.words

        font = cv2.FONT_HERSHEY_COMPLEX
        font_scale = 1
        thickness = 3
        (text_width, text_height), baseline = cv2.getTextSize('h', font, font_scale, thickness)
        widthPerChar = text_width

        captions = getCaptions(transcript, 5)
        captions = getCaptionTimestamps(captions, transcript)
        
        transcriptStart = wordList[0]["start"]
        transcriptEnd = wordList[-1]["end"]

        captionInd = 0
        wordInd = 0
        wordsOnDisplay = []

        currentCaption = captions[0]
        currItem = wordList[0]

        def pipeline(gf,t):
            """
            iterate through video frames adjusting the text displayed based on current caption and time 
            """
            nonlocal captionInd, wordInd, wordsOnDisplay, currentCaption, currItem, text_width

            # make sure we are in time range of transcript
            currFrame = gf(t).copy()
            if t < transcriptStart or t > transcriptEnd:
                return currFrame
            
            # advance caption if needed
            if t > currentCaption["end"] and captionInd < len(captions):
                captionInd += 1
                currentCaption = captions[captionInd]
                wordsOnDisplay = []
            
            # advance current item if needed
            if currItem['end'] < t and wordInd < len(wordList):
                wordInd += 1
                currItem = wordList[wordInd]
                wordsOnDisplay.append(currItem["word"])

            height, width = currFrame.shape[:2]
            numCharsPerLine = (width * widthPerChar)//2
            

            y = height//2
            y = y + y//2

            display = ' '.join(wordsOnDisplay)

            text_width = widthPerChar*len(display)
            x = (width-text_width)//2


            if x < 0:
                display = display[len(display)//2:] + "\n" + display[:len(display)//2]

            cv2.putText(currFrame, display, (x, y), cv2.FONT_HERSHEY_COMPLEX, 1, (255, 255, 255), 3, cv2.LINE_AA)
                
            return currFrame
        outVideoClip = video.fl(pipeline)
        tempNewVideoPath = os.path.join(temp_folder, "newVideo.mp4")
        outVideoClip.write_videofile(tempNewVideoPath)
        newVideoFile = open(tempNewVideoPath, 'rb')
        response = send_file(newVideoFile, as_attachment=True, download_name="processed_video.mp4", mimetype="video/mp4")

        return response            
    except Exception as e:
        print("NO GOOD", e)
        return jsonify({"error": str(e)}), 500

    

if __name__=="__main__":
    app.run(debug=True)