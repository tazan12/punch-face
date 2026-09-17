# index.html + css + js 를 단일 파일(dist/punchface.html)로 묶음 (Artifact/웹 배포용). assets 는 별도 첨부.
import re,os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
html=open('index.html',encoding='utf-8').read(); css=open('css/style.css',encoding='utf-8').read()
js='\n'.join(open(f'js/{n}.js',encoding='utf-8').read() for n in ['data','sprites','audio','fighter','combat','ai','career','net','draw','game'])
body=re.search(r'<body>(.*)</body>',html,re.S).group(1); body=re.sub(r'<script src="[^"]+"></script>\s*','',body)
out='<title>PUNCH FACE</title>\n<style>\n'+css+'\n#app{width:100%;height:100%;}\nhtml,body{height:100%;}\n</style>\n'+body+'\n<script>\n'+js+'\n</script>\n'
os.makedirs('dist',exist_ok=True); open('dist/punchface.html','w',encoding='utf-8').write(out); print(len(out)//1024,'KB')
