from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from .config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class WatchlistItem(Base):
    __tablename__ = "watchlist"
    id       = Column(Integer, primary_key=True, index=True)
    symbol   = Column(String, unique=True, nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow)


class PaperTrade(Base):
    __tablename__ = "paper_trades"
    id           = Column(Integer, primary_key=True, index=True)
    symbol       = Column(String, nullable=False)
    direction    = Column(String, nullable=False)
    quantity     = Column(Float, nullable=False)
    entry_price  = Column(Float, nullable=False)
    exit_price   = Column(Float, nullable=True)
    stop_loss    = Column(Float, nullable=True)
    take_profit  = Column(Float, nullable=True)
    order_type   = Column(String, default="MARKET")
    limit_price  = Column(Float, nullable=True)
    is_triggered = Column(Boolean, default=False)
    pnl          = Column(Float, default=0.0)
    is_open      = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    closed_at    = Column(DateTime, nullable=True)


class CachedSignal(Base):
    __tablename__ = "cached_signals"
    id           = Column(Integer, primary_key=True, index=True)
    symbol       = Column(String, unique=True, nullable=False)
    decision     = Column(String)
    confidence   = Column(Float)
    entry_price  = Column(Float, nullable=True)
    stop_loss    = Column(Float, nullable=True)
    take_profit  = Column(Float, nullable=True)
    reasoning_he = Column(String)
    generated_at = Column(DateTime, default=datetime.utcnow)


def create_tables():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
