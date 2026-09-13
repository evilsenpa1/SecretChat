from core.shared import exceptions


class UserNotFoundError(exceptions.NotFoundError):
    default_message = "User not found!"


class UserPermissionError(exceptions.AppPermissionError):
    default_message = "User permission error!"


class UserIntegrityError(exceptions.IntegrityError):
    default_message = "User integrity error!"
