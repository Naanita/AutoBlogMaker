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
        print("Iniciando WebDriver...")
        self.driver = uc.Chrome()
        self.wait = WebDriverWait(self.driver, 30)
        if not self.login_openai():
            print("Error de login. Saliendo...")
            exit(1)

    def login_openai(self):
        # Intentar login por cookies
        if os.path.exists(self.cookies_file):
            print("Intentando login por cookies...")
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
                print("Login por cookies exitoso!")
                return True
            else:
                print("Login por cookies fallido.")

        # Login desde cero
        print("Realizando login desde cero...")
        self.driver.get("https://chat.openai.com/")
        self.wait.until(EC.element_to_be_clickable((By.XPATH, "//div[text()='Log in']"))).click()
        time.sleep(2)  # Espera extra para cargar el formulario

        # Esperar redirección a auth.openai.com
        self.wait.until(lambda d: "auth.openai.com" in d.current_url)
        print(f"URL actual: {self.driver.current_url}")

        # Esperar campo de email
        try:
            user_input = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']")))
        except Exception:
            print("No se encontró el campo de email. Imprimiendo HTML para debug:")
            print(self.driver.page_source[:1500])
            return False

        user_input.send_keys(self.OPENAI_USER)
        self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[.='Continue']"))).click()

        # Esperar campo de password
        try:
            pass_input = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']")))
        except Exception:
            print("No se encontró el campo de password. Imprimiendo HTML para debug:")
            print(self.driver.page_source[:1500])
            return False

        pass_input.send_keys(self.OPENAI_PASS)
        self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[.='Continue']"))).click()

        self.comprobar_login(30)
        if self.comprobar_login(5):
            with open(self.cookies_file, "wb") as f:
                pickle.dump(self.driver.get_cookies(), f)
            print("Login exitoso y cookies guardadas!")
            # Ir a la página principal de ChatGPT tras login
            self.driver.get("https://chat.openai.com/")
            return True
        else:
            print("Login fallido.")
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
                # Nuevo selector para el área de mensaje
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
        # Limpiar el contenido anterior si lo hay
        self.driver.execute_script("arguments[0].innerHTML = '';", prompt_box)
        prompt_box.send_keys(prompt)
        send_btn = self.driver.find_element(By.CSS_SELECTOR, "button[data-testid='send-button']")
        send_btn.click()
        respuesta = ""
        inicio = time.time()
        # Esperar a que aparezca la respuesta
        while True:
            try:
                # Esperar a que termine la animación de respuesta (puede no estar presente siempre)
                self.driver.find_element(By.CSS_SELECTOR, "div[class*='result-streaming']")
                time.sleep(1)
            except Exception:
                # Buscar el último div con la respuesta
                markdowns = self.driver.find_elements(By.CSS_SELECTOR, "div.markdown.prose")
                if markdowns:
                    respuesta = markdowns[-1].text
                break
        print(f"Respuesta generada en {int(time.time() - inicio)} segundos.")
        return respuesta

    def cerrar(self):
        print("Cerrando navegador...")
        self.driver.quit()

if __name__ == "__main__":
    chatgpt = ChatGPT(OPENAI_USER, OPENAI_PASS)
    print("¡Listo! Ya puedes escribir tu prompt para ChatGPT.")
    while True:
        prompt = input("Introduce tu prompt (o 's' para salir): ")
        if prompt.lower() == "s":
            chatgpt.cerrar()
            break
        respuesta = chatgpt.chatear(prompt)
        print(f"ChatGPT: {respuesta}")