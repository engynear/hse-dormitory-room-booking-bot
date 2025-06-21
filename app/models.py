from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True) # Telegram User ID
    username = Column(String, unique=True, index=True)
    
    bookings = relationship("Booking", back_populates="user")

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    room = Column(String, index=True)
    start_time = Column(DateTime, index=True)
    end_time = Column(DateTime, index=True)
    user_room_number = Column(String)
    reason = Column(String, nullable=True)

    user = relationship("User", back_populates="bookings") 