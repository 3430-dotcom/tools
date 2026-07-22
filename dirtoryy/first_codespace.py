def fibonacci(n):
    if type(n) != int:
        return False
    if n <= 0:
        return 0
    elif n <= 2:
        return 1
    else:
        return fibonacci(n-1) + fibonacci(n-2)

def f_sum(a, b):
    n = a
    for i in range(a + 1, b + 1):
        n += i
    return n

def gcd(a, b):
    i = min(a, b)
    while True:
        if a % i == 0 and b % i == 0:
            return i
        i -= 1
    return False

def gcd_Euclid(a, b):
    if b == 0:
        return a
    return gcd_Euclid(b, a%b)

def student_pairs(name):
    if type(name) != list:
        return False
    
    length = len(name)
    name_list = []

    for i in range(length):
        n = 0
        for j in range(i + 1, length):
            if name[i] == name[j]:
                n += 1
        if n == 0:
            name_list.append(name[i])

    name_list_length = len(name_list)

    if not name_list:
        return False
    
    dt = []
    for i in range(name_list_length - 1):
        for j in range(i+1, name_list_length):
            dt.append((name_list[i], name_list[j]))

    return dt
