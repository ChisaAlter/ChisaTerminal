#!/bin/bash
# 设置测试 SSH 服务器的 root 密码并允许密码登录
set -e

echo "root:testpass" | chpasswd

SSHD_CONFIG="/etc/ssh/sshd_config"
if [ -f "$SSHD_CONFIG" ]; then
  sed -i "s/^#*PermitRootLogin.*/PermitRootLogin yes/" "$SSHD_CONFIG"
  sed -i "s/^#*PasswordAuthentication.*/PasswordAuthentication yes/" "$SSHD_CONFIG"
fi
