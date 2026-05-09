"""
BookWise AI — Helper Utilities
Common functions for streaming, formatting, and processing.
"""
import uuid
import json
from datetime import datetime
from typing import Generator, List, Dict, Any
import google.generativeai as genai


def is_gemini_quota_error(error: Exception) -> bool:
    """Return True when Gemini rejects a request due to quota or rate limits."""
    message = str(error).lower()
    return any(keyword in message for keyword in [
        "429",
        "quota exceeded",
        "rate limit",
        "resourceexhausted",
        "retry in",
        "free_tier_requests",
        "free_tier_input_token_count",
    ])

# ═══════════════════════════════════════════════════════════════
#  ID GENERATION
# ═══════════════════════════════════════════════════════════════

def generate_id(prefix: str = "") -> str:
    """Generate unique ID"""
    timestamp = int(datetime.utcnow().timestamp() * 1000)
    random_part = str(uuid.uuid4()).replace('-', '')[:8]
    return f"{prefix}_{timestamp}_{random_part}" if prefix else f"{timestamp}_{random_part}"


# ═══════════════════════════════════════════════════════════════
#  STREAMING RESPONSES
# ═══════════════════════════════════════════════════════════════

def stream_gemini_response(
    prompt: str,
    temperature: float = 0.7,
    top_p: float = 0.9,
    max_tokens: int = 1500,
) -> Generator[str, None, None]:
    """
    Stream response from Gemini API.
    
    Yields:
        Text chunks as they arrive
    """
    try:
        config = genai.types.GenerationConfig(
            temperature=temperature,
            top_p=top_p,
            max_output_tokens=max_tokens,
        )
        
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt, generation_config=config, stream=True)
        
        for chunk in response:
            if chunk.text:
                yield chunk.text
    
    except Exception as e:
        if is_gemini_quota_error(e):
            yield (
                "I’m temporarily using BookWise’s offline knowledge base because the Gemini free tier "
                "has hit its quota. Ask again later, or continue with book recommendations and summaries right now."
            )
            return

        yield f"Error: {str(e)}"


def stream_sse_format(data: str, event: str = "message") -> str:
    """Format data for Server-Sent Events"""
    return f"event: {event}\ndata: {json.dumps({'content': data})}\n\n"


def stream_sse_done() -> str:
    """SSE done signal"""
    return "event: done\ndata: {}\n\n"


# ═══════════════════════════════════════════════════════════════
#  TEXT PROCESSING
# ═══════════════════════════════════════════════════════════════

def clean_text(text: str) -> str:
    """Clean and normalize text"""
    # Remove extra whitespace
    text = ' '.join(text.split())
    return text


def truncate_text(text: str, max_length: int = 500, suffix: str = "...") -> str:
    """Truncate text to max length"""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def format_timestamp(dt: datetime) -> str:
    """Format datetime for display"""
    if not dt:
        return ""
    
    now = datetime.utcnow()
    diff = now - dt
    
    seconds = diff.total_seconds()
    
    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes}m ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours}h ago"
    elif seconds < 604800:
        days = int(seconds / 86400)
        return f"{days}d ago"
    else:
        return dt.strftime("%b %d")


def extract_code_blocks(text: str) -> List[Dict[str, str]]:
    """Extract code blocks from markdown"""
    import re
    pattern = r'```(\w+)?\n(.*?)\n```'
    matches = re.findall(pattern, text, re.DOTALL)
    
    return [
        {
            "language": lang or "text",
            "code": code.strip(),
        }
        for lang, code in matches
    ]


def format_markdown_code(text: str) -> str:
    """Ensure code blocks are properly formatted"""
    import re
    
    # Fix code blocks without language
    text = re.sub(r'```(?!\w)', '```text', text)
    
    return text


# ═══════════════════════════════════════════════════════════════
#  JSON HANDLING
# ═══════════════════════════════════════════════════════════════

def safe_json_loads(text: str, default: Any = None) -> Any:
    """Safely parse JSON"""
    try:
        return json.loads(text)
    except:
        return default


def safe_json_dumps(obj: Any, indent: int = 2) -> str:
    """Safely serialize to JSON"""
    try:
        return json.dumps(obj, indent=indent)
    except:
        return "{}"


# ═══════════════════════════════════════════════════════════════
#  VALIDATION
# ═══════════════════════════════════════════════════════════════

def validate_file_upload(
    filename: str,
    file_size: int,
    max_size_mb: int = 25,
    allowed_extensions: tuple = ('.pdf', '.docx', '.txt', '.html', '.json', '.md', '.xml', '.csv'),
) -> tuple[bool, str]:
    """
    Validate uploaded file.
    
    Returns:
        (is_valid, error_message)
    """
    # Check extension
    if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
        return False, f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
    
    # Check size
    max_bytes = max_size_mb * 1024 * 1024
    if file_size > max_bytes:
        return False, f"File too large. Max: {max_size_mb}MB"
    
    return True, ""


def validate_api_key(api_key: str) -> bool:
    """Validate Gemini API key format"""
    # Basic validation - can be enhanced
    return len(api_key) > 20


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe storage"""
    import re
    # Remove special characters
    filename = re.sub(r'[^\w\s.-]', '', filename)
    # Limit length
    return filename[:255]


# ═══════════════════════════════════════════════════════════════
#  STATISTICS
# ═══════════════════════════════════════════════════════════════

def calculate_reading_time(word_count: int, wpm: int = 200) -> int:
    """Calculate reading time in minutes"""
    return max(1, word_count // wpm)


def get_text_statistics(text: str) -> Dict[str, Any]:
    """Get comprehensive text statistics"""
    words = text.split()
    sentences = [s.strip() for s in text.split('.') if s.strip()]
    
    return {
        "char_count": len(text),
        "word_count": len(words),
        "sentence_count": len(sentences),
        "avg_word_length": sum(len(w) for w in words) / max(1, len(words)),
        "avg_sentence_length": len(words) / max(1, len(sentences)),
        "reading_time_minutes": calculate_reading_time(len(words)),
    }


# ═══════════════════════════════════════════════════════════════
#  FORMATTING
# ═══════════════════════════════════════════════════════════════

def format_file_size(bytes_size: int) -> str:
    """Format bytes to human-readable size"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024:
            return f"{bytes_size:.1f}{unit}"
        bytes_size /= 1024
    return f"{bytes_size:.1f}TB"


def format_response_for_display(text: str, include_metadata: bool = True) -> str:
    """Format AI response for display"""
    # Ensure proper markdown formatting
    text = format_markdown_code(text)
    return text


def create_citation(source: str, page: int = None, section: str = None) -> str:
    """Create formatted citation"""
    citation = f"Source: {source}"
    if page:
        citation += f", Page {page}"
    if section:
        citation += f" ({section})"
    return citation
