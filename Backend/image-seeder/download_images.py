import json
import os
import re
import time
import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# Read the JSON file
with open("dried-fruits-nuts.json", "r", encoding="utf-8") as f:
    items = json.load(f)

# Create output directory
output_dir = "downloaded-images"
os.makedirs(output_dir, exist_ok=True)


def sanitize_filename(name):
    """Remove or replace characters that are invalid in filenames."""
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = name.strip()
    return name


def setup_driver():
    """Set up Chrome in headless mode."""
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=options)
    return driver


def close_pinterest_modal(driver):
    """Close the Pinterest signup modal if it appears."""
    try:
        # Wait for the close button with the specific classes
        close_btn = WebDriverWait(driver, 8).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, ".VHreRh.cLlqFI.XjRT60"))
        )
        close_btn.click()
        time.sleep(2)
        return True
    except TimeoutException:
        # Modal might not appear, that's okay
        return False


def get_pinterest_image_url(driver):
    """Extract the main image URL from the Pinterest page."""
    # Try elementtiming="closeupImage" first (most specific)
    try:
        img = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'img[elementtiming="closeupImage"]')
            )
        )
        src = img.get_attribute("src")
        if src and "pinimg.com" in src:
            return src
    except (TimeoutException, NoSuchElementException):
        pass

    # Fallback: try img with class iFOUS5 inside pin-closeup-image
    try:
        img = driver.find_element(
            By.CSS_SELECTOR, '[data-test-id="pin-closeup-image"] img.iFOUS5'
        )
        src = img.get_attribute("src")
        if src and "pinimg.com" in src:
            return src
    except NoSuchElementException:
        pass

    # Fallback: any img with class iFOUS5
    try:
        imgs = driver.find_elements(By.CSS_SELECTOR, "img.iFOUS5")
        for img in imgs:
            src = img.get_attribute("src")
            if src and "pinimg.com" in src and "75x75" not in src:
                return src
    except NoSuchElementException:
        pass

    # Fallback: look for og:image meta tag
    try:
        meta = driver.find_element(By.CSS_SELECTOR, 'meta[property="og:image"]')
        content = meta.get_attribute("content")
        if content:
            return content
    except NoSuchElementException:
        pass

    return None


def get_high_res_url(url):
    """Try to get the highest resolution version of a Pinterest image."""
    if "pinimg.com" in url:
        # Replace common size prefixes with originals for highest res
        url = re.sub(r'/\d+x\d*/', '/originals/', url)
    return url


def download_image_from_url(img_url, filepath):
    """Download an image from a direct URL."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    response = requests.get(img_url, headers=headers, timeout=30)
    response.raise_for_status()

    with open(filepath, "wb") as f:
        f.write(response.content)

    return os.path.getsize(filepath)


def download_google_share_image(driver, url, name, output_dir):
    """Handle Google share links separately."""
    safe_name = sanitize_filename(name)
    try:
        driver.get(url)
        time.sleep(5)

        # Try to find the main image on Google share page
        img = None
        for selector in ['img[src*="googleusercontent"]', 'img[src*="lh3."]', 'img[src*="lh5."]', "img"]:
            try:
                imgs = driver.find_elements(By.CSS_SELECTOR, selector)
                for i in imgs:
                    src = i.get_attribute("src")
                    if src and ("googleusercontent" in src or "lh3." in src or "lh5." in src):
                        img = i
                        break
                if img:
                    break
            except NoSuchElementException:
                continue

        if img:
            img_url = img.get_attribute("src")
            filepath = os.path.join(output_dir, f"{safe_name}.jpg")
            download_image_from_url(img_url, filepath)
            return filepath
        
        # Fallback: try og:image
        try:
            meta = driver.find_element(By.CSS_SELECTOR, 'meta[property="og:image"]')
            content = meta.get_attribute("content")
            if content:
                filepath = os.path.join(output_dir, f"{safe_name}.jpg")
                download_image_from_url(content, filepath)
                return filepath
        except NoSuchElementException:
            pass

    except Exception:
        pass

    return None


print(f"Starting download of {len(items)} images...")
print(f"Saving to: {os.path.abspath(output_dir)}")
print(f"Setting up Chrome browser...\n")

driver = setup_driver()

success_count = 0
fail_count = 0
failed_items = []

try:
    for i, item in enumerate(items, 1):
        name = item["name"]
        url = item["image"]
        safe_name = sanitize_filename(name)

        print(f"[{i}/{len(items)}] Processing: {name}")

        try:
            is_google = "share.google" in url or "google.com" in url

            if is_google:
                result = download_google_share_image(driver, url, name, output_dir)
                if result:
                    size_kb = os.path.getsize(result) / 1024
                    print(f"         OK - Downloaded ({size_kb:.1f} KB)")
                    success_count += 1
                else:
                    print(f"         FAIL - Could not find image on Google share page")
                    fail_count += 1
                    failed_items.append(item)
            else:
                # Pinterest URL
                driver.get(url)
                time.sleep(3)

                # Close the signup modal
                close_pinterest_modal(driver)

                # Get the image URL
                img_url = get_pinterest_image_url(driver)

                if img_url:
                    # Try to get high-res version
                    high_res_url = get_high_res_url(img_url)

                    # Determine extension from URL
                    ext = ".jpg"
                    if ".png" in img_url:
                        ext = ".png"
                    elif ".webp" in img_url:
                        ext = ".webp"
                    elif ".gif" in img_url:
                        ext = ".gif"

                    filepath = os.path.join(output_dir, f"{safe_name}{ext}")

                    # Try high-res first, fall back to original
                    try:
                        size = download_image_from_url(high_res_url, filepath)
                    except Exception:
                        size = download_image_from_url(img_url, filepath)

                    size_kb = size / 1024
                    print(f"         OK - Downloaded ({size_kb:.1f} KB)")
                    success_count += 1
                else:
                    print(f"         FAIL - Could not find image URL")
                    fail_count += 1
                    failed_items.append(item)

        except Exception as e:
            print(f"         FAIL - Error: {str(e)[:100]}")
            fail_count += 1
            failed_items.append(item)

        # Small delay between requests
        time.sleep(1)

finally:
    driver.quit()
    print(f"\n{'='*50}")
    print(f"Download complete!")
    print(f"  Successful: {success_count}")
    print(f"  Failed:     {fail_count}")
    print(f"  Total:      {len(items)}")
    print(f"  Saved to:   {os.path.abspath(output_dir)}")

    if failed_items:
        print(f"\nFailed items:")
        for item in failed_items:
            print(f"  - {item['name']} ({item['image']})")

        # Save failed items to a file for retry
        with open("failed-downloads.json", "w", encoding="utf-8") as f:
            json.dump(failed_items, f, indent=2, ensure_ascii=False)
        print(f"\nFailed items saved to: failed-downloads.json")
