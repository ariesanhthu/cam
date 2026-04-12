Text to Audio Converter
Introduction
Zalo Text-To-Speech (ZTTS) engine delivers fast and premium quality audios from input Vietnamese text. ZTTS is optimized for realtime and high volume traffic applications such as news websites, voice streaming services, chatbots, and virtual assistants. ZTTS currently supports four Vietnamese voices including two Northern accents and two Southern accents.

How to call API
API url
POST  https://api.zalo.ai/v1/tts/synthesize
Required  header
apikey: authentication token to access APIs, 
Post data
input: text content to synthesize.
speed: Optional, float value inside range [0.8, 1.2], larger is faster, default 1.0.
quality: Available for paid user only, quality of generated speech
Value encode	Description
0	Default value, standard quality,
1	High quality
encode_type: Optional,  standard encoding for audio files 
Value encode	Description
0	WAV
1	MP3
2	AAC
speaker_id: Optional, ID of speaker, default 1. List of speaker:
ID	Name
1	South women 1
2	Northern women 1
3	South men
4	Northern men
5	Northern women 2
6	South women 2
Example request
curl \
  -H "apikey: your_api_key_here" \
  --data-urlencode "input=Chứng khoán châu Á đỏ lửa" \
  -X POST https://api.zalo.ai/<version>/tts/synthesize
curl \
  -H "apikey: your_api_key_here" \
  --data-urlencode "input=Rất nhiều khách hàng hỏi chúng tôi vì sao đôla Mỹ lại mất giá." \
  -d "speaker_id=3" \
  -X POST https://api.zalo.ai/<version>/tts/synthesize
curl \
  -H "apikey: your_api_key_here" \
  --data-urlencode "input=Chơi game gì? Coi phim gì? Đi chơi chỗ nào?" \
  -d "speaker_id=4" \
  -d "speed=0.8" \
  -X POST https://api.zalo.ai/<version>/tts/synthesize
Example response
Successful response with http error_code  0
{
   "error_code":0,
   "error_message":"Successful.",
   "data":{
      "url":"https://chunk.lab.zalo.ai/bb49d943a114484a1105/bb49d943a114484a1105"
   }
}
url: generated streaming url
Error response
Error response with http error_code other than 0
{
    "error_code": 500,
    "error_message": "Internal server error",
    "data": []
}
List of error_code
error_code	error_message
0	Success
150	Invalid parameter value
155	Your input exceeds the allowed limit of 2000 characters
400	Wrong request parameter
401	Wrong apikey
413	Error occurred
500	Internal server error