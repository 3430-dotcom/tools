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