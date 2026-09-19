class AppError(Exception):
    def __init__(self, message: str | None = None, *args: object) -> None:
        self.default_message = self.default_message or message
        super().__init__(self.default_message, *args)


class NotFoundError(AppError):
    default_message = "Not Found!"


class ValidationError(AppError):
    default_message = "Validation failed!"


class IntegrityError(AppError):
    default_message = "Conflict!"


class AppPermissionError(AppError):
    default_message = "Permission denied!"
