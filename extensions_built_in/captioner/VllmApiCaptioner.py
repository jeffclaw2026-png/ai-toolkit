
import base64
import io
from collections import OrderedDict

import requests
from PIL import Image

from .BaseCaptioner import BaseCaptioner


class VllmApiCaptioner(BaseCaptioner):
    """
    Captioner that calls an external OpenAI-compatible vision API (e.g. a
    running vLLM server) instead of loading model weights locally. Zero
    download: point it at your existing server.

    Config keys (caption section):
      model_name_or_path: model id to send as "model" (e.g. unsloth/Qwen3.8-27B-NVFP4)
      api_url:            chat completions endpoint (default http://127.0.0.1:8000/v1/chat/completions)
      caption_prompt:     the user-side instruction (system prompt equivalent)
      max_res:            long-edge downscale before base64 (default 1024)
      max_new_tokens:     completion budget
    """

    def load_model(self):
        self.api_url = getattr(self.caption_config, "api_url", None) or "http://127.0.0.1:8000/v1/chat/completions"
        self.print_and_status_update(f"VllmApiCaptioner ready (remote: {self.api_url})")

    def get_caption_for_file(self, file_path: str) -> str:
        img = self.load_pil_image(file_path, max_res=getattr(self.caption_config, "max_res", 1024))
        if img.mode != "RGB":
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        img_b64 = base64.b64encode(buf.getvalue()).decode()

        # caption_prompt doubles as the instruction; prepend a system message for stability
        resp = requests.post(
            self.api_url,
            json={
                "model": self.caption_config.model_name_or_path,
                "messages": [
                    {"role": "system", "content": "You are a precise image captioner. Answer with the caption only."},
                    {"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                        {"type": "text", "text": self.caption_config.caption_prompt},
                    ]},
                ],
                "max_tokens": self.caption_config.max_new_tokens,
                "temperature": 0.2,
            },
            timeout=600,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"].get("content")
        if not content:
            # reasoning models may return content=None with reasoning text; retry once with reasoning off
            resp = requests.post(
                self.api_url,
                json={
                    "model": self.caption_config.model_name_or_path,
                    "messages": [
                        {"role": "user", "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                            {"type": "text", "text": self.caption_config.caption_prompt},
                        ]},
                    ],
                    "max_tokens": max(self.caption_config.max_new_tokens, 512),
                    "temperature": 0.2,
                    "chat_template_kwargs": {"enable_thinking": False},
                },
                timeout=600,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"].get("content")
        return (content or "").strip()

