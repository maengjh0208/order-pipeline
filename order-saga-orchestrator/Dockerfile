FROM python:3.12-slim

# uv를 pip으로 설치하는 대신, uv 공식 팀이 배포하는 Docker 이미지에서 바이너리 파일 자체를 복사해온다.
# (uv 자체가 Rust로 만들어진 단일 실행 파일이라 이게 제일 빠르고 표준적인 방법)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# 먼저 pyproject.toml, uv.lock만 복사해와서 의존성만 설치하고, 그 다음에 나머지 코드를 복사한다.
# uv sync : uv가 pyproject.toml, uv.lock 파일을 기준으로 가상환경에 의존성을 동기화(설치)한다. pip install과 비슷하지만, lock 파일 기준으로 정확히 필요한 패키지들만 설치/제거해서 환경을 동기화시킨다는 점이 다르다.
# --frozen : uv.lock 파일을 업데이트하지 않고, uv.lock 파일에 기록된 버전 그대로만 사용해서 설치한다.
# --no-install-project : 현재 작업 중인 프로젝트 자체(패키지)는 설치하지 않고, 의존성 패키지들만 설치한다. 의존성만 먼저 설치해서 Docker 레이어 캐시를 최대한 활용하고, 이후 소스 코드를 COPY하고 나서 uv sync --frozen을 한번 더 실행해서 프로젝트 자체를 설치하는 패턴이 일반적이다.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-install-project

# 실제 소스 코드를 복사하고 두번쨰로 uv sync를 실행해서 프로젝트 자체까지 설치한다.
# (이미 설치된 의존성은 그대로 사용하고 프로젝트 자체만 추가로 설치)
# 순서를 이렇게 해놓으면, 코드만 바꿨을 때 위 의존성 설치 레이어는 캐시로 건너뛰고 이 아래만 다시 실행된다.
COPY ./src ./src
RUN uv sync --frozen

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "order_saga_orchestrator.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]