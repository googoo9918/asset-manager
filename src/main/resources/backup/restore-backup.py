"""Restore an Asset Manager backup into a NEW PostgreSQL database and NEW directory."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tempfile
import zipfile


def verify(archive):
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) > 100000 or sum(i.file_size for i in infos) > 10 * 1024**3:
            raise ValueError('Backup exceeds verification limits (100000 files / 10 GB).')
        names = [i.filename for i in infos]
        if len({n.casefold() for n in names}) != len(names):
            raise ValueError('Duplicate archive paths.')
        for i in infos:
            n, p = i.filename, PurePosixPath(i.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in n or ':' in n or p.as_posix() != n:
                raise ValueError('Unsafe archive path.')
            if (i.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Symbolic links are not supported.')
            if n not in {'manifest.json', 'database.dump', 'restore-backup.py', 'RESTORE.txt'}:
                if not n.startswith('data/kb-card/') or not n.endswith('.json') or not re.fullmatch(r'[A-Za-z0-9_./-]+', n):
                    raise ValueError('Unexpected archive file.')
                for part in p.parts:
                    if part.endswith(('.', ' ')) or part.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}:
                        raise ValueError('Unsafe Windows file name.')
        if z.getinfo('manifest.json').file_size > 16 * 1024**2:
            raise ValueError('Manifest too large.')
        manifest = json.loads(z.read('manifest.json'))
        if manifest.get('format') != 'asset-manager-backup' or manifest.get('version') != 1:
            raise ValueError('Unsupported backup format.')
        records = manifest['files']
        if len({r['path'] for r in records}) != len(records) or {r['path'] for r in records} != set(names) - {'manifest.json'}:
            raise ValueError('Manifest does not match archive.')
        if 'database.dump' not in names:
            raise ValueError('Database dump missing.')
        for record in records:
            digest = hashlib.sha256()
            with z.open(record['path']) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(chunk)
            if z.getinfo(record['path']).file_size != record['bytes'] or digest.hexdigest() != record['sha256']:
                raise ValueError('Backup checksum mismatch.')
        with z.open('database.dump') as source:
            if source.read(5) != b'PGDMP':
                raise ValueError('Not a PostgreSQL custom dump.')
        return manifest


def restore(args):
    archive = Path(args.archive).resolve(strict=True)
    manifest = verify(archive)
    if args.verify_only:
        print(f"Verified {len(manifest['files'])} files. Created: {manifest['createdAt']}")
        return
    if not args.database or not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', args.database):
        raise ValueError('Choose a NEW database name (lowercase letters, numbers, underscores).')
    if args.database in {'postgres', 'template0', 'template1'}:
        raise ValueError('System database names cannot be used.')
    if not args.user or not args.output_dir:
        raise ValueError('--user and --output-dir are required.')
    output = Path(args.output_dir).absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('Output directory must not exist. Existing data is never overwritten.')
    binary = lambda name: str(Path(args.pg_bin) / (name + ('.exe' if os.name == 'nt' else ''))) if args.pg_bin else name
    env = dict(os.environ)
    if 'PGPASSWORD' not in env:
        env['PGPASSWORD'] = getpass.getpass('PostgreSQL password: ')
    env['PGCONNECT_TIMEOUT'] = '10'
    connection = ['--host', args.host, '--port', str(args.port), '--username', args.user, '--no-password']
    def run(name, arguments):
        result = subprocess.run([binary(name), *connection, *arguments], env=env, capture_output=True, timeout=600)
        if result.returncode:
            raise RuntimeError(f'{name} failed. Check database permissions/version and use a new target on retry.')
        return result.stdout.decode('utf-8').strip()
    exists = run('psql', ['--no-psqlrc', '--dbname', 'postgres', '--tuples-only', '--no-align', '--command', f"SELECT 1 FROM pg_database WHERE datname='{args.database}'"])
    if exists:
        raise ValueError('Target database already exists. Existing data is never overwritten.')
    # Validate/extract BEFORE database creation. Never extract arbitrary ZIP paths.
    output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix='restore-', dir=output) as temp:
        dump = Path(temp) / 'database.dump'
        with zipfile.ZipFile(archive) as z:
            for record in manifest['files']:
                name = record['path']
                if name != 'database.dump' and not name.startswith('data/kb-card/'):
                    continue
                destination = dump if name == 'database.dump' else output.joinpath(*PurePosixPath(name).parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with z.open(name) as source, destination.open('xb') as target:
                    shutil.copyfileobj(source, target)
        # createdb rejects races where someone creates this DB after the preflight.
        run('createdb', ['--maintenance-db', 'postgres', '--template', 'template0', args.database])
        run('pg_restore', ['--dbname', args.database, '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction', str(dump)])
    print('Restore completed into NEW database and directory. Original data was not modified.')
    print('Stop the app before switching its DB configuration and card-data folder. Reconcile outstanding orders with KIS before trading.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--database')
    parser.add_argument('--user')
    parser.add_argument('--output-dir')
    parser.add_argument('--pg-bin')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=5432, type=int)
    try:
        restore(parser.parse_args())
    except (ValueError, KeyError, OSError, RuntimeError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        parser.exit(1, str(error) + '\n')
