from core.shared import exceptions


class UserNotFoundError(exceptions.NotFoundError):
    pass


class UserPermissionError(exceptions.PermissionError):
    pass


class UserIntegrityError(exceptions.IntegrityError):
    pass
