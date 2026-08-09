import math
# 들어가는 글- 절댓값 구하기 알고리즘
# 일반적인 방식
def abs_Value(num):
    if num < 0:
        return -num
    else:
        return num

# 제곱근 사용
def abs_square(num):
    b = num**2
    return math.sqrt(b)
# 첫째 마당- 알고리즘 기초

# 1장 1번 - 1부터 n까지의 합구하기
# 일반적
def sum(num):
    tot = 0
    for i in range(1, num+1):
        tot += i
    return tot
# 가우스 방식
def gauss_sum(num):
    return num*(num+1)//2
# 재귀방식
def summ(num):
    if num == 1:
        return 1
    else:
        return num + summ(num-1)
# 연습문제
def summul(num):
    a = 1
    for i in range(1, num+1):
        a += i**2
    return a

# 1장 2번 - 최댓값 찾기
# 일반적 방법
def find_max(arr):
    a = arr[0]
    for i in range(len(arr)):
        if a <= arr[i]:
            a = arr[i]
    return a
# 최댓값의 index 리턴하기 
def find_max_idx(arr):
    a = 0
    for i in range(len(arr)):
        if arr[a] <= arr[i]:
            a = i
    return a
# 연습문제
# num = map(int, input().split())
def inputmax(num):
    a = num[0]
    for n in num:
        if a < n:
            a = n
    return n

# 3장 동명이인 찾기
# 두 번 이상 나온 이름 찾기
def finddouble(name):
    n = len(name)
    a = set()
    for i in range(n-1):
        for j in range(i+1, n):
            if name[i] == name[j]:
                a.add(a[i])
    return a
# 연습문제-짝 지어주기
def pair(name):
    n = len(name)
    # a = set()
    for i in range(n-1):
        for j in range(i+1, n):
            print(name[i], '-', name[j])
    #         aa = set()
    #         aa.add(name[i])
    #         aa.add(name[j])
    #         a.add(aa)
    # return a
