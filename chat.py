import os
import time
import pickle
import tempfile

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from config import OPENAI_USER, OPENAI_PASS

class ChatGPT:
    def __init__(self, user, password):
        self.OPENAI_USER = user
        self.OPENAI_PASS = password
        self.cookies_file = os.path.join(tempfile.gettempdir(), "openai.cookies")
        options = uc.ChromeOptions()
        options.headless = True  # Ejecutar en modo headless (sin ventana)
        options.add_argument("--window-size=1920,1080")  # Opcional, para evitar errores de renderizado
        self.driver = uc.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 30)
        if not self.login_openai():
            exit(1)

    def login_openai(self):
        if os.path.exists(self.cookies_file):
            with open(self.cookies_file, "rb") as f:
                cookies = pickle.load(f)
            self.driver.get("https://chat.openai.com/robots.txt")
            for cookie in cookies:
                try:
                    self.driver.add_cookie(cookie)
                except Exception:
                    pass
            self.driver.get("https://chat.openai.com/")
            if self.comprobar_login(30):
                return True
            else:
                pass

        self.driver.get("https://chat.openai.com/")
        self.wait.until(EC.element_to_be_clickable((By.XPATH, "//div[text()='Log in']"))).click()
        time.sleep(2)
        self.wait.until(lambda d: "auth.openai.com" in d.current_url)

        try:
            user_input = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']")))
        except Exception:
            return False

        user_input.send_keys(self.OPENAI_USER)
        self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[.='Continue']"))).click()

        try:
            pass_input = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']")))
        except Exception:
            return False

        pass_input.send_keys(self.OPENAI_PASS)
        self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[.='Continue']"))).click()

        self.comprobar_login(30)
        if self.comprobar_login(5):
            with open(self.cookies_file, "wb") as f:
                pickle.dump(self.driver.get_cookies(), f)
            self.driver.get("https://chat.openai.com/")
            return True
        else:
            return False

    def comprobar_login(self, tiempo):
        login = False
        while tiempo > 0:
            try:
                next_btn = self.driver.find_element(By.XPATH, "//button[text()='Next']")
                next_btn.click()
            except Exception:
                pass
            try:
                done_btn = self.driver.find_element(By.XPATH, "//button[text()='Done']")
                done_btn.click()
            except Exception:
                pass
            try:
                prompt_box = self.driver.find_element(By.CSS_SELECTOR, "div#prompt-textarea[contenteditable='true']")
                if prompt_box.is_enabled():
                    login = True
                    break
            except Exception:
                pass
            time.sleep(1)
            tiempo -= 1
        return login

    def chatear(self, prompt):
        prompt_box = self.driver.find_element(By.CSS_SELECTOR, "div#prompt-textarea[contenteditable='true']")
        prompt_box.click()
        self.driver.execute_script("arguments[0].innerHTML = '';", prompt_box)
        prompt_box.send_keys(prompt)
        self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button[aria-label='Send prompt']")))
        send_btn = self.driver.find_element(By.CSS_SELECTOR, "button[aria-label='Send prompt']")
        send_btn.click()

        respuesta = ""
        inicio = time.time()
        try:
            self.wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "div[data-message-author-role='assistant'] div.markdown.prose")
                )
            )
            last_text = ""
            stable_count = 0
            while True:
                markdowns = self.driver.find_elements(
                    By.CSS_SELECTOR, "div[data-message-author-role='assistant'] div.markdown.prose"
                )
                if markdowns:
                    last_markdown = markdowns[-1]
                    current_text = last_markdown.text.strip()
                    if current_text == last_text and current_text != "":
                        stable_count += 1
                    else:
                        stable_count = 0
                    last_text = current_text
                    if stable_count >= 2:
                        respuesta = current_text
                        break
                time.sleep(0.5)
        except Exception as e:
            pass

        return respuesta

    def cerrar(self):
        self.driver.quit()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        prompt = sys.argv[1]
        chatgpt = ChatGPT(OPENAI_USER, OPENAI_PASS)
        respuesta = chatgpt.chatear(prompt)
        if hasattr(sys.stdout, "buffer"):
            sys.stdout.buffer.write((respuesta + "\n").encode("utf-8", errors="replace"))
            sys.stdout.flush()
        else:
            print(respuesta)
        chatgpt.cerrar()
    else:
        chatgpt = ChatGPT(OPENAI_USER, OPENAI_PASS)
        print("¡Listo! Ya puedes escribir tu prompt para ChatGPT.")
        while True:
            prompt = input("Introduce tu prompt (o 's' para salir): ")
            if prompt.lower() == "s":
                chatgpt.cerrar()
                break
            respuesta = chatgpt.chatear(prompt)
            print(respuesta)