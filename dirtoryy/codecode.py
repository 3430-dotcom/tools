import first_codespace
user_input = list(map(str, input('enter names separated by space: ').split()))
result = first_codespace.student_pairs(user_input)

if result:
    print('the student pairs are:')
    for a, b in result:
        print(f"{a} - {b}")
        
else: 
    print('not found')



