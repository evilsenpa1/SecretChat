class AppError(Exception):
    pass


class NotFoundError(AppError):
    pass


class ValidationError(AppError):
    pass


class IntegrityError(AppError):
    pass


class PermissionError(AppError):
    pass
