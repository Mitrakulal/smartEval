from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.answers import router as answers_router
from app.api.exam import router as exam_router
from app.api.jobs import router as jobs_router
from app.api.students import router as students_router
from app.core.config import settings
from app.core.db import init_db
from app.core.errors import register_error_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database tables and seed singleton exam row
    init_db()
    yield
    # Shutdown logic if required


app = FastAPI(
    title="SmartEval API",
    version="1.4",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register contract error handlers
register_error_handlers(app)

# Mount API routers
app.include_router(exam_router, prefix="/api")
app.include_router(students_router, prefix="/api")
app.include_router(answers_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")


@app.get("/health")
def health_check():
    """Basic health check endpoint."""
    return {"status": "ok"}
