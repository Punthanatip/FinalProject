FROM python:3.10-slim

# Install system libraries needed for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN python3 -m pip install --no-cache-dir --upgrade pip && \
    python3 -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision && \
    python3 -m pip install --no-cache-dir -r requirements.txt

COPY models /models
COPY app.py .

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
