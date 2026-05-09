"""
BookWise AI — Database Models & ORM
Handles persistent storage for conversations, sessions, documents, and user preferences.
"""
import os
import json
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer, Float, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

# Database configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "bookwise.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ═══════════════════════════════════════════════════════════════
#  DATABASE MODELS
# ═══════════════════════════════════════════════════════════════

class User(Base):
    """User profile and preferences"""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Preferences
    theme = Column(String, default="dark")  # dark, light
    language = Column(String, default="en")
    auto_language_detect = Column(Boolean, default=True)
    
    # Personalization
    favorite_genres = Column(Text, default=json.dumps([]))  # JSON array
    reading_history = Column(Text, default=json.dumps([]))  # JSON array
    mood_preferences = Column(Text, default=json.dumps({}))  # JSON object
    favorite_authors = Column(Text, default=json.dumps([]))  # JSON array
    
    # AI Settings
    default_temperature = Column(Float, default=0.7)
    default_top_p = Column(Float, default=0.9)
    
    # Relationships
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat(),
            "theme": self.theme,
            "language": self.language,
            "default_temperature": self.default_temperature,
            "default_top_p": self.default_top_p,
        }


class Conversation(Base):
    """Chat conversation session"""
    __tablename__ = "conversations"
    
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Settings for this conversation
    temperature = Column(Float, default=0.7)
    top_p = Column(Float, default=0.9)
    language = Column(String, default="en")
    
    # Metadata
    message_count = Column(Integer, default=0)
    is_archived = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "message_count": self.message_count,
        }


class Message(Base):
    """Individual chat message"""
    __tablename__ = "messages"
    
    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), index=True)
    
    role = Column(String, index=True)  # "user" or "assistant"
    content = Column(Text)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    language = Column(String, default="en")
    
    # For regeneration/editing
    is_edited = Column(Boolean, default=False)
    edited_at = Column(DateTime, nullable=True)
    
    # For citations and sources
    sources = Column(Text, default=json.dumps([]))  # JSON array of source references
    
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    
    def to_dict(self):
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "language": self.language,
        }


class Document(Base):
    """Uploaded document for Q&A"""
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    
    filename = Column(String)
    original_filename = Column(String)
    file_type = Column(String)  # pdf, docx, txt, etc.
    
    # Content
    content = Column(Text)  # Raw text content
    extracted_text = Column(Text)  # Cleaned text
    
    # Metadata
    file_size = Column(Integer)
    char_count = Column(Integer)
    page_count = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # RAG embedding
    embeddings_generated = Column(Boolean, default=False)
    embedding_model = Column(String, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "original_filename": self.original_filename,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "created_at": self.created_at.isoformat(),
        }


class DocumentChunk(Base):
    """Document chunk for RAG/vector search"""
    __tablename__ = "document_chunks"
    
    id = Column(String, primary_key=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"), index=True)
    
    # Content
    content = Column(Text)
    chunk_index = Column(Integer)
    
    # Position info
    start_char = Column(Integer)
    end_char = Column(Integer)
    page_number = Column(Integer, nullable=True)
    
    # Vector embedding (stored as JSON)
    embedding = Column(Text, nullable=True)  # JSON array of floats
    embedding_model = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    document = relationship("Document", back_populates="chunks")


class BookRecommendation(Base):
    """Tracked book recommendations"""
    __tablename__ = "book_recommendations"
    
    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True)
    
    # Book info
    title = Column(String)
    author = Column(String)
    genre = Column(String)
    cover_image_url = Column(String, nullable=True)
    
    # Recommendation metadata
    reason = Column(Text)  # Why it was recommended
    rating = Column(Float, nullable=True)
    goodreads_link = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "genre": self.genre,
            "reason": self.reason,
        }


class FeedbackLog(Base):
    """User feedback for improvements"""
    __tablename__ = "feedback_logs"
    
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    message_id = Column(String, nullable=True)
    
    feedback_type = Column(String)  # helpful, unhelpful, incorrect, etc.
    feedback_text = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
#  DATABASE UTILITIES
# ═══════════════════════════════════════════════════════════════

def init_db():
    """Initialize database and create all tables"""
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialized successfully")


def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user(user_id: str):
    """Get or create user"""
    db = SessionLocal()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    db.close()
    return user


def create_conversation(user_id: str, title: str = "New Chat", temperature: float = 0.7, top_p: float = 0.9):
    """Create a new conversation"""
    import uuid
    db = SessionLocal()
    conv = Conversation(
        id=f"conv_{uuid.uuid4()}",
        user_id=user_id,
        title=title,
        temperature=temperature,
        top_p=top_p,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    db.close()
    return conv


def add_message(conversation_id: str, role: str, content: str, language: str = "en", sources: list = None):
    """Add a message to conversation"""
    import uuid
    db = SessionLocal()
    msg = Message(
        id=f"msg_{uuid.uuid4()}",
        conversation_id=conversation_id,
        role=role,
        content=content,
        language=language,
        sources=json.dumps(sources) if sources else json.dumps([]),
    )
    db.add(msg)
    
    # Update conversation metadata
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conv:
        conv.message_count += 1
        conv.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(msg)
    db.close()
    return msg


def get_conversation_history(conversation_id: str, limit: int = 50):
    """Get conversation history"""
    db = SessionLocal()
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.asc()).limit(limit).all()
    db.close()
    return [msg.to_dict() for msg in messages]


def save_document(user_id: str, filename: str, original_filename: str, file_type: str, 
                  content: str, file_size: int, page_count: int = None):
    """Save uploaded document"""
    import uuid
    db = SessionLocal()
    doc = Document(
        id=f"doc_{uuid.uuid4()}",
        user_id=user_id,
        filename=filename,
        original_filename=original_filename,
        file_type=file_type,
        content=content,
        extracted_text=content,
        file_size=file_size,
        char_count=len(content),
        page_count=page_count,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    db.close()
    return doc
