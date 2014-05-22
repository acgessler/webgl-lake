from subprocess import call
from os import chdir

chdir("..")
chdir("medea")
call(["python", "compile.py", "-c", "../build/medea-compile-config.txt"])