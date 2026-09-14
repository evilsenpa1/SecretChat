import logging.config

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from chat.api import router as chat
from core.db.router import router as db
from core.exception_handlers import domain_error_handler
from core.logging_config import LOGGING
# from core.middlewares import RequestLoggerMiddleware
from core.shared.exceptions import AppError
from users.api import router as user

logging.config.dictConfig(LOGGING)

app = FastAPI()


# app.add_middleware(RequestLoggerMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, domain_error_handler)

app.include_router(db)
app.include_router(user)
app.include_router(chat)

if __name__ == "__main__":
    uvicorn.run("app", reload=True)
