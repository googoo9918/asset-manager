# 데이터 백업·복원

설정 → 데이터 백업·복원 → **지금 백업 만들기**에서 백업 ZIP을 생성하고 다운로드합니다.
백업은 `.local/backups/`에 저장되며 Git에서 제외됩니다. 삭제·자동 주기 백업은 아직 지원하지 않습니다.
같은 PC의 파일만으로는 디스크 고장에 대비할 수 없으므로 다운로드한 파일을 별도 저장장치에도 보관하세요.

## 포함 범위

- PostgreSQL 전체 DB: 계좌, 거래, 보정 이력, 스냅샷, 주문 이력 등
- `data/kb-card` 아래 수집 JSON과 전표 캐시, 카드 혜택 자료
- SHA-256 체크섬 목록, `restore-backup.py`, `RESTORE.txt`

API 키, DB 비밀번호, 브라우저 인증정보와 앱 실행 파일은 포함하지 않습니다.
DB는 pg_dump의 일관된 스냅샷입니다. 전표는 생성 중 순차 복사하므로 수집이 끝난 뒤 백업합니다.
실패한 백업의 임시 파일은 지우고 완료한 ZIP만 목록에 노출합니다.
백업 생성 및 다운로드는 같은 PC의 앱 요청으로 제한합니다.

## 도구 설정

PostgreSQL의 pg_dump를 PATH 또는 Windows 기본 설치 경로에서 찾습니다.
별도 설치라면 `application-local.yml`에 `app.backup.pg-dump`로 실행 파일 경로를 지정합니다.
DB 서버와 호환되는 pg_dump 버전과 DB 조회 권한이 필요합니다.
현재 백업용 연결은 단일 호스트 PostgreSQL JDBC 주소를 지원하며 JDBC 쿼리 옵션은 거부합니다.

## 복원

앱과 전표 수집을 종료합니다. 본인이 생성하여 보관한 백업만 사용합니다.
ZIP의 복원 도구는 Python 3 표준 라이브러리와 PostgreSQL 도구만 사용합니다.

```powershell
python restore-backup.py --archive backup-....zip --verify-only
python restore-backup.py --archive backup-....zip --database asset_restored --user asset_user --output-dir C:\DEV\asset-restored --pg-bin 'C:\Program Files\PostgreSQL\18\bin'
```

비밀번호는 프롬프트에서 입력하거나 PGPASSWORD 환경변수로 제공합니다.
대상 DB와 폴더는 **새 이름**이어야 합니다. 기존 데이터는 덮어쓰지 않습니다.
체크섬, 허용 파일 경로, PostgreSQL 덤프 형식을 검증한 후 복원합니다.
덤프 복원은 단일 트랜잭션이며 실패하면 생성된 새 DB·폴더가 남을 수 있습니다.
실패 이유를 해결한 뒤 다른 새 이름으로 다시 시도합니다.

복원 결과를 확인하고 로컬 설정의 DB 주소를 변경합니다. 기존 `data/kb-card`는 별도 보관한 뒤
복구 폴더의 `data/kb-card`로 교체합니다. 이전 DB는 유지합니다. 앱을 재시작해 잔액·거래·전표를 확인합니다.
백업 이후 발생한 주문 상태는 KIS에서 먼저 확인해야 합니다. 복원은 증권사 거래를 되돌리지 않습니다.

## 검증

- `BackupServiceTest`: 포함 파일·체크섬·다운로드 경로·실패 정리
- `BackupControllerTest`: 로컬 접근 및 요청 출처
- `tests/backup-restore-test.py`: 손상·경로 탈출·누락 덤프 거절
- `tests/settings-record-browser.cjs`: 백업 생성·다운로드 목록 UI
- `BackupRoundTripTest`: 명시적으로 준비한 `127.0.0.1:55441/backup_source` 테스트 DB에서만 실행
  (`ASSET_BACKUP_DB_TEST=true`, `ASSET_BACKUP_PYTHON`에 Python 경로 지정)
