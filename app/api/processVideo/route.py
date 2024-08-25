from flask import Flask, jsonify, request
from flask_cors import CORS
from moviepy.editor import VideoFileClip
from openai import OpenAI

import tempfile
import os

# python app/api/processVideo/route.py

app = Flask(__name__)
# CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}}, supports_credentials=True)
CORS(app)

@app.route('/api/processVideo', methods=['POST'])
def processVideo():

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
        # temp video file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tempVideo:
            tempVideoPath = tempVideo.name
            videoFile.save(tempVideoPath)

           

        # temp audio file
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tempAudio:
            tempAudioPath = tempAudio.name
        
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

        transcriptList = transcript.words
        print(transcriptList)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    finally:
        # Clean up temporary files
        if tempVideoPath and os.path.exists(tempVideoPath):
            try:
                os.unlink(tempVideoPath)
            except Exception as e:
                app.logger.error(f"Error deleting temporary file: {e}")
    
    return jsonify({"transcriptList": transcriptList})

if __name__=="__main__":
    app.run(debug=True)