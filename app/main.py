import os
import json
from datetime import datetime, timedelta, timezone, date
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import aiogram
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from dotenv import load_dotenv

from . import crud, models, schemas
from .database import SessionLocal, engine, Base
from .utils import validate_init_data # We will create this file later

load_dotenv()

# --- Globals ---
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")

# --- Database ---
Base.metadata.create_all(bind=engine)

# --- FastAPI app ---
app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Telegram Bot ---
bot = aiogram.Bot(token=BOT_TOKEN)
dp = aiogram.Dispatcher()

@dp.message(aiogram.filters.CommandStart())
async def start_handler(message: aiogram.types.Message):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📅 Забронировать комнату", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await message.answer(
        "Добро пожаловать! Нажмите на кнопку ниже, чтобы забронировать комнату.",
        reply_markup=keyboard
    )

@app.on_event("startup")
async def on_startup():
    webhook_info = await bot.get_webhook_info()
    if webhook_info.url != WEBAPP_URL:
        await bot.set_webhook(url=f"{WEBAPP_URL}/webhook")

@app.post("/webhook")
async def webhook(request: Request):
    update = aiogram.types.Update.model_validate(await request.json(), context={"bot": bot})
    await dp.feed_update(bot, update)

@app.on_event("shutdown")
async def on_shutdown():
    await bot.delete_webhook()

# --- API Endpoints ---
async def get_user_from_webapp_data(request: Request, db: Session = Depends(get_db)):
    init_data = request.headers.get("X-Telegram-Init-Data")
    if not init_data:
        raise HTTPException(status_code=401, detail="Not authorized")

    is_valid, data = await validate_init_data(BOT_TOKEN, init_data)
    if not is_valid:
        raise HTTPException(status_code=403, detail="Invalid data")

    user_data = json.loads(data['user'])
    user_id = user_data['id']
    username = user_data.get('username', f"user_{user_id}")
    
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        user_in = schemas.UserCreate(id=user_id, username=username)
        db_user = crud.create_user(db, user=user_in)
        
    return db_user

@app.get("/api/rooms")
def get_rooms():
    return ["Тенниска", "Боталка в блоках", "Боталка в коридорах 2 этажа", "Боталка в коридорах 3 этажа"]

@app.get("/api/bookings-by-date", response_model=list[schemas.BookingPublic])
def get_bookings_by_date(
    date: date,
    user: models.User = Depends(get_user_from_webapp_data), # for auth
    db: Session = Depends(get_db)
):
    return crud.get_bookings_by_date(db, query_date=date)

@app.get("/api/my-bookings", response_model=list[schemas.Booking])
def get_my_bookings(user: models.User = Depends(get_user_from_webapp_data), db: Session = Depends(get_db)):
    return crud.get_user_bookings(db, user_id=user.id)

@app.post("/api/book", response_model=schemas.Booking)
def create_booking(
    booking: schemas.BookingCreate,
    user: models.User = Depends(get_user_from_webapp_data),
    db: Session = Depends(get_db)
):
    # Validation
    if booking.start_time < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Нельзя бронировать в прошлом")
    if booking.start_time > datetime.now(timezone.utc) + timedelta(days=7):
        raise HTTPException(status_code=400, detail="Нельзя бронировать больше, чем на 7 дней вперед")
    if booking.end_time <= booking.start_time:
        raise HTTPException(status_code=400, detail="Время окончания должно быть после времени начала")
    if booking.end_time - booking.start_time < timedelta(minutes=15):
        raise HTTPException(status_code=400, detail="Минимальная длительность брони - 15 минут.")
    if booking.end_time - booking.start_time > timedelta(hours=4):
        raise HTTPException(status_code=400, detail="Бронь не может длиться дольше 4 часов")
    
    current_bookings = crud.get_user_bookings(db, user_id=user.id)
    if len(current_bookings) >= 2:
        raise HTTPException(status_code=400, detail="У вас может быть максимум 2 активные брони")

    if not crud.is_room_available(db, room=booking.room, start_time=booking.start_time, end_time=booking.end_time):
        raise HTTPException(status_code=400, detail="Эта комната уже занята на выбранное время.")

    return crud.create_booking(db=db, booking=booking, user_id=user.id)

@app.delete("/api/booking/{booking_id}")
def delete_booking(
    booking_id: int,
    user: models.User = Depends(get_user_from_webapp_data),
    db: Session = Depends(get_db)
):
    deleted_booking = crud.delete_booking(db, booking_id=booking_id, user_id=user.id)
    if not deleted_booking:
        raise HTTPException(status_code=404, detail="Бронь не найдена или у вас нет прав на её удаление")
    return {"ok": True}

# --- Static Files ---
app.mount("/", StaticFiles(directory="app/static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 