extends CharacterBody2D

@onready var animace = $AnimatedSprite2D

# Tímto vytvoříme v Inspectoru "chlíveček", kam myší přetáhneme nepřítele
@export var cil_utoku : Node2D 

func _input(event):
	if event.is_action_pressed("ui_accept") and not animace.is_playing():
		autok()

func autok():
	print("BUM! Útok!")
	animace.play("Attack")
	
	# TADY JE TA MAGIE:
	# Nechceme, aby nepřítel umřel hned, jak zmáčkneme klávesu.
	# Chceme počkat, až meč dopadne (třeba na konec animace).
	await animace.animation_finished
	
	# Teď, když animace skončila, řekneme nepříteli, že to schytal.
	if cil_utoku != null:
		# Voláme funkci, kterou jsme napsali v kroku 1
		cil_utoku.dostal_zasah()
	else:
		print("Nemám na koho útočit! (Zapomněl jsi nastavit cíl)")
