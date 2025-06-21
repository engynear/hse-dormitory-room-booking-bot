import hmac
import hashlib
from urllib.parse import unquote, parse_qsl

async def validate_init_data(bot_token: str, init_data: str):
    """
    Validates the init_data string from a Telegram Web App.
    """
    try:
        parsed_data = dict(parse_qsl(init_data))
    except ValueError:
        return False, {}

    if "hash" not in parsed_data:
        return False, {}

    init_data_hash = parsed_data.pop("hash")

    data_check_string = "\n".join(
        f"{key}={parsed_data[key]}" for key in sorted(parsed_data.keys())
    )

    secret_key = hmac.new(
        key="WebAppData".encode(), msg=bot_token.encode(), digestmod=hashlib.sha256
    )
    calculated_hash = hmac.new(
        key=secret_key.digest(),
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if calculated_hash == init_data_hash:
        return True, parsed_data
    return False, {} 