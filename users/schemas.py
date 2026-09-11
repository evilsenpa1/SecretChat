from pydantic import BaseModel, Field


class LoginRequestSchema(BaseModel):
    name: str = Field(max_length=20)
    password: str


class UserResponseSchema(BaseModel):
    id: int
    name: str
