#!/usr/bin/env python3
"""Cambia la contraseña de acceso de la página (usuario: admin).

Uso, dentro de la carpeta del proyecto:
    python3 cambiar-clave.py

Pide la contraseña dos veces (no se ve al escribir) y guarda en
js/termico/acceso.js solo su huella PBKDF2-SHA256 y una sal nueva al azar.
La contraseña no queda escrita en ningún archivo.
"""
import getpass
import hashlib
import os
import re
import secrets
import sys

ARCHIVO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "js", "termico", "acceso.js")
ITERACIONES = 150000  # debe coincidir con «iteraciones» en acceso.js


def main():
    clave = os.environ.get("CLAVE_PRUEBA")  # solo para pruebas automáticas
    if clave is None:
        clave = getpass.getpass("Nueva contraseña: ")
        if clave != getpass.getpass("Repítela: "):
            sys.exit("No coinciden. No se cambió nada.")
    if len(clave) < 10:
        sys.exit("Usa al menos 10 caracteres. No se cambió nada.")

    sal = secrets.token_hex(16)
    huella = hashlib.pbkdf2_hmac("sha256", clave.encode("utf-8"), bytes.fromhex(sal), ITERACIONES).hex()

    texto = open(ARCHIVO, encoding="utf-8").read()
    texto, n1 = re.subn(r'sal: "[0-9a-f]*",', f'sal: "{sal}",', texto, count=1)
    texto, n2 = re.subn(r'huella: "[0-9a-f]*",', f'huella: "{huella}",', texto, count=1)
    if n1 != 1 or n2 != 1:
        sys.exit("No encontré dónde escribir la huella en acceso.js. No se cambió nada.")
    open(ARCHIVO, "w", encoding="utf-8").write(texto)
    print("Listo: contraseña cambiada. Sube el cambio (commit + push) para que rija en la web.")


if __name__ == "__main__":
    main()
