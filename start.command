#!/bin/zsh
cd "${0:A:h}"
if ! command -v python3 >/dev/null; then
  print '需要 Python 3.10 或更高版本。'
  read '?按回车关闭。'
  exit 1
fi
python3 server.py "$@"
if (( $? != 0 )); then
  print '查看器未启动。如果已在运行，请打开 http://127.0.0.1:8766 。'
  read '?按回车关闭。'
fi
