from core.shared import exceptions


class ChatNotFoundError(exceptions.NotFoundError):
    default_message = "Chat not found!"


class ChatPermissionError(exceptions.AppPermissionError):
    default_message = "Chat permission error!"


class ChatIntegrityError(exceptions.IntegrityError):
    default_message = "Chat integrity error!"
