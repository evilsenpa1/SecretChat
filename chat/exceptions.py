from core.shared import exceptions


class ChatNotFoundError(exceptions.NotFoundError):
    pass


class ChatPermissionError(exceptions.PermissionError):
    pass


class ChatIntegrityError(exceptions.IntegrityError):
    pass
