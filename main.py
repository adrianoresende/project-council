"""ASGI compatibility entrypoint for platforms that resolve `main:app`."""

from backend.main import app

__all__ = ["app", "main"]


def main() -> None:
    print("Hello from llm-council!")


if __name__ == "__main__":
    main()
