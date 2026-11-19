#!/usr/bin/env python3
"""Decrypt the Git LFS handoff with its private Dropbox key, then verify it."""
import argparse, base64, hashlib, json, os, subprocess, sys, tarfile
from pathlib import Path

MAGIC=b'DRAWING-BOARD-LFS-GCM-1\x00'

def sha256(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
    return h.hexdigest()

def aad(entry):
    return json.dumps({'format':1,'file':entry['file'],'restore_as':entry['restore_as']},sort_keys=True,separators=(',',':')).encode()

def decrypt_file(source,dest,key,entry):
    from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes
    if source.stat().st_size!=entry['bytes'] or sha256(source)!=entry['sha256']:raise RuntimeError('Ciphertext checksum mismatch: '+entry['file'])
    dest.parent.mkdir(parents=True,exist_ok=True)
    temporary=Path(str(dest)+'.decrypting')
    try:
        with source.open('rb') as src:
            if src.read(len(MAGIC))!=MAGIC:raise RuntimeError('Unknown encryption format')
            nonce=src.read(12);src.seek(-16,2);tag=src.read(16)
            count=source.stat().st_size-len(MAGIC)-12-16;src.seek(len(MAGIC)+12)
            dec=Cipher(algorithms.AES(key),modes.GCM(nonce,tag)).decryptor();dec.authenticate_additional_data(aad(entry))
            with temporary.open('wb') as out:
                while count:
                    b=src.read(min(count,8*1024*1024))
                    if not b:raise RuntimeError('Truncated ciphertext')
                    out.write(dec.update(b));count-=len(b)
                out.write(dec.finalize())
        temporary.replace(dest)
    except BaseException:
        if temporary.exists():temporary.unlink()
        raise

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--key-file',type=Path,required=True)
    ap.add_argument('--archive-dir',type=Path,default=Path(__file__).resolve().parent)
    ap.add_argument('--output',type=Path,required=True,help='NEW directory for decrypted archive files')
    ap.add_argument('--extract-to',type=Path,help='Optionally restore the verified files into another NEW directory')
    args=ap.parse_args();root=args.archive_dir.resolve();out=args.output.resolve()
    if out.exists() and any(out.iterdir()):raise RuntimeError('Output directory must be new/empty')
    out.mkdir(parents=True,exist_ok=True)
    key_info=json.loads(args.key_file.read_text());key=base64.b64decode(key_info['key_base64'])
    if len(key)!=32:raise RuntimeError('Invalid AES-256 key length')
    manifest_path=root/'ENCRYPTED-MANIFEST.json'
    if sha256(manifest_path)!=key_info['encrypted_manifest_sha256']:raise RuntimeError('Encrypted manifest does not match the private restore key')
    manifest=json.loads(manifest_path.read_text())
    for e in sorted(manifest['entries'],key=lambda e:0 if e['kind']=='metadata' else 1):
        rel=Path(e['restore_as'])
        if rel.is_absolute() or '..' in rel.parts:raise RuntimeError('Invalid restore path')
        dest=out/rel
        print('Decrypting',e['file'],flush=True);decrypt_file(root/e['file'],dest,key,e)
        if e['kind']=='metadata':
            with tarfile.open(dest,'r:gz') as tar:
                for member in tar.getmembers():
                    p=Path(member.name)
                    if p.is_absolute() or '..' in p.parts or not member.isfile():raise RuntimeError('Unsafe metadata member')
                tar.extractall(out)
    subprocess.run([sys.executable,str(out/'restore_backup.py'),'--backup-dir',str(out),'--skip-archive-content-check'],check=True)
    if args.extract_to:
        subprocess.run([sys.executable,str(out/'restore_backup.py'),'--backup-dir',str(out),'--files-only','--restore-to',str(args.extract_to)],check=True)
    print('Authenticated decryption and archive-file checksums passed.',flush=True)

if __name__=='__main__':main()
